"""Dividends API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.dividend import DividendRound, DividendClaim
from app.models.token import Token
from app.models.snapshot import CurrentBalance
from app.schemas.dividend import (
    DividendRoundResponse,
    CreateDividendRequest,
    UnclaimedDividendsResponse,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


def _round_to_response(r: DividendRound, total_claimed: int = 0, claim_count: int = 0) -> DividendRoundResponse:
    """Convert DividendRound model to response schema"""
    return DividendRoundResponse(
        id=r.id,
        round_number=r.round_number,
        payment_token=r.payment_token,
        total_pool=r.total_pool,
        amount_per_share=r.amount_per_share,
        snapshot_slot=r.snapshot_slot,
        status=r.status,
        created_at=r.created_at,
        expires_at=r.expires_at,
        total_claimed=total_claimed,
        claim_count=claim_count,
    )


@router.get("", response_model=List[DividendRoundResponse])
async def list_dividend_rounds(token_id: int, db: AsyncSession = Depends(get_db)):
    """List all dividend rounds"""
    result = await db.execute(
        select(DividendRound)
        .where(DividendRound.token_id == token_id)
        .order_by(DividendRound.round_number.desc())
    )
    rounds = result.scalars().all()

    responses = []
    for r in rounds:
        # Get claim statistics
        claim_result = await db.execute(
            select(
                func.sum(DividendClaim.amount).label('total_claimed'),
                func.count(DividendClaim.id).label('claim_count')
            ).where(DividendClaim.round_id == r.id)
        )
        claim_stats = claim_result.first()
        total_claimed = claim_stats.total_claimed or 0
        claim_count = claim_stats.claim_count or 0

        responses.append(_round_to_response(r, total_claimed, claim_count))

    return responses


@router.get("/{round_id}", response_model=DividendRoundResponse)
async def get_dividend_round(token_id: int, round_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific dividend round"""
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()

    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    # Get claim statistics
    claim_result = await db.execute(
        select(
            func.sum(DividendClaim.amount).label('total_claimed'),
            func.count(DividendClaim.id).label('claim_count')
        ).where(DividendClaim.round_id == round_obj.id)
    )
    claim_stats = claim_result.first()
    total_claimed = claim_stats.total_claimed or 0
    claim_count = claim_stats.claim_count or 0

    return _round_to_response(round_obj, total_claimed, claim_count)


@router.post("")
async def create_dividend_round(
    token_id: int,
    request: CreateDividendRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new dividend round - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Check dividends are enabled
    if not token.features.get("dividends_enabled", False):
        raise HTTPException(status_code=400, detail="Dividends not enabled for this token")

    # Validate payment token address
    try:
        payment_token_pubkey = Pubkey.from_string(request.payment_token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payment token address format")

    if request.total_pool <= 0:
        raise HTTPException(status_code=400, detail="Total pool must be positive")

    # Get next round number
    result = await db.execute(
        select(func.max(DividendRound.round_number)).where(DividendRound.token_id == token_id)
    )
    max_num = result.scalar() or 0
    next_num = max_num + 1

    # Build transaction data
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    dividend_pda, _ = solana_client.derive_dividend_round_pda(token_config_pda, next_num)

    return {
        "message": "Dividend round creation transaction prepared for signing",
        "round_number": next_num,
        "dividend_pda": str(dividend_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "create_dividend_round",
            "data": {
                "payment_token": request.payment_token,
                "total_pool": request.total_pool,
                "expires_in_seconds": request.expires_in_seconds,
            }
        }
    }


@router.post("/{round_id}/claim")
async def claim_dividend(token_id: int, round_id: int, db: AsyncSession = Depends(get_db)):
    """Claim dividend for a round - returns unsigned transaction for client signing"""
    # Get dividend round
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()

    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    if round_obj.status != "active":
        raise HTTPException(status_code=400, detail=f"Dividend round is {round_obj.status}")

    # Check expiration
    now = datetime.utcnow()
    if round_obj.expires_at and now > round_obj.expires_at:
        raise HTTPException(status_code=400, detail="Dividend round has expired")

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    dividend_pda, _ = solana_client.derive_dividend_round_pda(token_config_pda, round_obj.round_number)

    return {
        "message": "Claim dividend transaction prepared for signing",
        "dividend_pda": str(dividend_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "claim_dividend",
            "data": {
                "round_id": round_id,
            }
        }
    }


@router.get("/unclaimed/{address}", response_model=UnclaimedDividendsResponse)
async def get_unclaimed_dividends(
    token_id: int,
    address: str,
    db: AsyncSession = Depends(get_db)
):
    """Get unclaimed dividends for a wallet"""
    # Get wallet's balance for calculating entitlement
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == address
        )
    )
    balance_record = result.scalar_one_or_none()

    if not balance_record or balance_record.balance == 0:
        return UnclaimedDividendsResponse(
            total_unclaimed=0,
            rounds=[]
        )

    # Get all active dividend rounds
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.status == "active"
        ).order_by(DividendRound.round_number.desc())
    )
    active_rounds = result.scalars().all()

    # Find unclaimed rounds for this wallet
    unclaimed_rounds = []
    total_unclaimed = 0

    for round_obj in active_rounds:
        # Check if already claimed
        result = await db.execute(
            select(DividendClaim).where(
                DividendClaim.round_id == round_obj.id,
                DividendClaim.wallet == address
            )
        )
        existing_claim = result.scalar_one_or_none()

        if not existing_claim:
            # Calculate entitlement based on amount per share
            entitlement = balance_record.balance * round_obj.amount_per_share

            # Get claim stats for response
            claim_result = await db.execute(
                select(
                    func.sum(DividendClaim.amount).label('total_claimed'),
                    func.count(DividendClaim.id).label('claim_count')
                ).where(DividendClaim.round_id == round_obj.id)
            )
            claim_stats = claim_result.first()

            unclaimed_rounds.append(_round_to_response(
                round_obj,
                claim_stats.total_claimed or 0,
                claim_stats.claim_count or 0
            ))
            total_unclaimed += entitlement

    return UnclaimedDividendsResponse(
        total_unclaimed=total_unclaimed,
        rounds=unclaimed_rounds
    )
