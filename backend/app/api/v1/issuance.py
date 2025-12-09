"""Token issuance API endpoints for instant token awards"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.issuance import TokenIssuance
from app.models.wallet import Wallet
from app.models.token import Token
from app.models.snapshot import CurrentBalance
from app.schemas.issuance import (
    IssueTokensRequest,
    BulkIssueTokensRequest,
    TokenIssuanceResponse,
    IssueTokensTransactionResponse,
)
from app.services.solana_client import get_solana_client
from app.services.history import HistoryService
from solders.pubkey import Pubkey
import structlog

router = APIRouter()
logger = structlog.get_logger()


async def _update_balance(db: AsyncSession, token_id: int, wallet: str, amount: int):
    """Update or create a balance record for a wallet"""
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == wallet
        )
    )
    balance = result.scalar_one_or_none()

    if balance:
        balance.balance += amount
        balance.last_updated_slot = 0  # Will be updated when synced from chain
        balance.updated_at = datetime.utcnow()
    else:
        balance = CurrentBalance(
            token_id=token_id,
            wallet=wallet,
            balance=amount,
            last_updated_slot=0,
        )
        db.add(balance)


@router.get("", response_model=List[TokenIssuanceResponse])
async def list_issuances(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """List all token issuances for a token"""
    result = await db.execute(
        select(TokenIssuance).where(TokenIssuance.token_id == token_id).order_by(TokenIssuance.created_at.desc())
    )
    issuances = result.scalars().all()

    return [_issuance_to_response(i) for i in issuances]


@router.get("/recent", response_model=List[TokenIssuanceResponse])
async def get_recent_issuances(
    token_id: int = Path(...),
    limit: int = 10,
    max_slot: int = None,
    db: AsyncSession = Depends(get_db)
):
    """Get most recent issuances for a token (for dashboard).

    If max_slot is provided, only returns issuances with slot <= max_slot.
    """
    query = select(TokenIssuance).where(TokenIssuance.token_id == token_id)

    if max_slot is not None:
        query = query.where(TokenIssuance.slot <= max_slot)

    query = query.order_by(TokenIssuance.created_at.desc()).limit(limit)

    result = await db.execute(query)
    issuances = result.scalars().all()

    return [_issuance_to_response(i) for i in issuances]


@router.get("/stats")
async def get_issuance_stats(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get issuance statistics for a token"""
    from sqlalchemy import func, and_
    from datetime import timedelta

    # Get total issuances
    total_result = await db.execute(
        select(func.count()).select_from(TokenIssuance).where(TokenIssuance.token_id == token_id)
    )
    total_issuances = total_result.scalar() or 0

    # Get 24h stats
    yesterday = datetime.utcnow() - timedelta(hours=24)
    stats_24h = await db.execute(
        select(func.count(), func.coalesce(func.sum(TokenIssuance.amount), 0))
        .select_from(TokenIssuance)
        .where(
            and_(
                TokenIssuance.token_id == token_id,
                TokenIssuance.created_at >= yesterday,
            )
        )
    )
    row = stats_24h.one()
    issuances_24h = row[0] or 0
    volume_24h = row[1] or 0

    return {
        "total_issuances": total_issuances,
        "issuances_24h": issuances_24h,
        "volume_24h": volume_24h,
    }


@router.get("/wallet/{address}", response_model=List[TokenIssuanceResponse])
async def get_wallet_issuances(
    token_id: int = Path(...),
    address: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get all issuances for a specific wallet"""
    result = await db.execute(
        select(TokenIssuance).where(
            TokenIssuance.token_id == token_id,
            TokenIssuance.recipient == address
        ).order_by(TokenIssuance.created_at.desc())
    )
    issuances = result.scalars().all()

    return [_issuance_to_response(i) for i in issuances]


@router.post("")
async def issue_tokens(
    request: IssueTokensRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Issue tokens to a wallet - returns unsigned transaction for client signing"""
    # Get token - token_id in URL is the business token_id, not the internal id
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate recipient address format
    try:
        recipient_pubkey = Pubkey.from_string(request.recipient)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recipient address format")

    # Validate amount
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Check if wallet is on allowlist and active
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.recipient
        )
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=400, detail="Wallet not on allowlist. Add wallet to allowlist first.")
    if wallet.status != "active":
        raise HTTPException(status_code=400, detail=f"Wallet status is '{wallet.status}'. Only active wallets can receive tokens.")

    # Get current slot from Solana
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    # Create issuance record - mark as completed immediately for testing
    # In production, this would be "pending" until on-chain tx confirms
    issuance = TokenIssuance(
        token_id=token_id,
        recipient=request.recipient,
        amount=request.amount,
        notes=request.notes,
        slot=current_slot,
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db.add(issuance)

    # Update balance in database (simulates on-chain mint for testing)
    await _update_balance(db, token_id, request.recipient, request.amount)

    await db.commit()
    await db.refresh(issuance)

    # Auto-create snapshot after token issuance
    try:
        history_service = HistoryService(db)
        await history_service.create_snapshot(
            token_id=token_id,
            trigger=f"token_issuance:{issuance.id}",
            slot=current_slot,
        )
        await db.commit()
    except Exception as e:
        logger.warning("Failed to create auto-snapshot after token issuance", error=str(e))

    return {
        "message": f"Successfully issued {request.amount} tokens to {request.recipient}",
        "issuance_id": issuance.id,
        "recipient": request.recipient,
        "amount": request.amount,
        "status": "completed",
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "mint_to",
            "data": {
                "recipient": request.recipient,
                "amount": request.amount,
                "mint": token.mint_address,
            }
        }
    }


@router.post("/bulk")
async def bulk_issue_tokens(
    request: BulkIssueTokensRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Issue tokens to multiple wallets - returns unsigned transactions for client signing"""
    # Get token - token_id in URL is the business token_id, not the internal id
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))

    instructions = []
    errors = []
    issuance_ids = []

    for issuance_req in request.issuances:
        try:
            # Validate address
            recipient_pubkey = Pubkey.from_string(issuance_req.recipient)

            # Validate amount
            if issuance_req.amount <= 0:
                raise ValueError("Amount must be positive")

            # Check allowlist
            result = await db.execute(
                select(Wallet).where(
                    Wallet.token_id == token_id,
                    Wallet.address == issuance_req.recipient
                )
            )
            wallet = result.scalar_one_or_none()
            if not wallet:
                raise ValueError("Wallet not on allowlist")
            if wallet.status != "active":
                raise ValueError(f"Wallet status is '{wallet.status}'")

            # Create issuance record
            issuance = TokenIssuance(
                token_id=token_id,
                recipient=issuance_req.recipient,
                amount=issuance_req.amount,
                notes=issuance_req.notes,
                status="pending"
            )
            db.add(issuance)
            await db.flush()

            instructions.append({
                "issuance_id": issuance.id,
                "recipient": issuance_req.recipient,
                "amount": issuance_req.amount,
                "data": {
                    "recipient": issuance_req.recipient,
                    "amount": issuance_req.amount,
                    "mint": token.mint_address,
                }
            })
            issuance_ids.append(issuance.id)

        except Exception as e:
            errors.append({
                "recipient": issuance_req.recipient,
                "error": str(e)
            })

    await db.commit()

    return {
        "message": f"Bulk issuance prepared: {len(instructions)} valid, {len(errors)} errors",
        "program": str(solana_client.program_addresses.token),
        "action": "bulk_mint_to",
        "instructions": instructions,
        "issuance_ids": issuance_ids,
        "errors": errors
    }


@router.post("/{issuance_id}/confirm")
async def confirm_issuance(
    issuance_id: int = Path(...),
    token_id: int = Path(...),
    tx_signature: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Confirm a token issuance after successful on-chain transaction"""
    result = await db.execute(
        select(TokenIssuance).where(
            TokenIssuance.token_id == token_id,
            TokenIssuance.id == issuance_id
        )
    )
    issuance = result.scalar_one_or_none()

    if not issuance:
        raise HTTPException(status_code=404, detail="Issuance not found")

    if issuance.status == "completed":
        raise HTTPException(status_code=400, detail="Issuance already confirmed")

    issuance.status = "completed"
    issuance.tx_signature = tx_signature
    issuance.completed_at = datetime.utcnow()

    await db.commit()

    return {
        "message": "Issuance confirmed",
        "issuance_id": issuance.id,
        "status": "completed",
        "tx_signature": tx_signature
    }


@router.post("/{issuance_id}/fail")
async def fail_issuance(
    issuance_id: int = Path(...),
    token_id: int = Path(...),
    error: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Mark an issuance as failed"""
    result = await db.execute(
        select(TokenIssuance).where(
            TokenIssuance.token_id == token_id,
            TokenIssuance.id == issuance_id
        )
    )
    issuance = result.scalar_one_or_none()

    if not issuance:
        raise HTTPException(status_code=404, detail="Issuance not found")

    if issuance.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot fail a completed issuance")

    issuance.status = "failed"
    if error:
        issuance.notes = f"{issuance.notes or ''}\nError: {error}".strip()

    await db.commit()

    return {
        "message": "Issuance marked as failed",
        "issuance_id": issuance.id,
        "status": "failed"
    }


def _issuance_to_response(i: TokenIssuance) -> TokenIssuanceResponse:
    return TokenIssuanceResponse(
        id=i.id,
        recipient=i.recipient,
        amount=i.amount,
        issued_by=i.issued_by,
        notes=i.notes,
        tx_signature=i.tx_signature,
        slot=i.slot,
        status=i.status,
        created_at=i.created_at,
        completed_at=i.completed_at,
    )
