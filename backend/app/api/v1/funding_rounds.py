"""Funding Rounds API endpoints"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.token import Token
from app.models.share_class import ShareClass, SharePosition
from app.models.funding_round import FundingRound, Investment
from app.models.valuation import ValuationEvent
from app.models.wallet import Wallet
from app.models.snapshot import CurrentBalance
from app.schemas.investment import (
    CreateFundingRoundRequest,
    AddInvestmentRequest,
    FundingRoundResponse,
    InvestmentResponse,
    ShareClassResponse,
)

router = APIRouter()


def _build_share_class_response(sc: ShareClass) -> ShareClassResponse:
    """Convert ShareClass model to response schema"""
    return ShareClassResponse(
        id=sc.id,
        name=sc.name,
        symbol=sc.symbol,
        priority=sc.priority,
        preference_multiple=sc.preference_multiple,
        is_convertible=sc.is_convertible,
        votes_per_share=sc.votes_per_share,
        created_at=sc.created_at,
    )


def _build_investment_response(inv: Investment) -> InvestmentResponse:
    """Convert Investment model to response schema"""
    return InvestmentResponse(
        id=inv.id,
        investor_wallet=inv.investor_wallet,
        investor_name=inv.investor_name,
        amount=inv.amount,
        shares_received=inv.shares_received,
        price_per_share=inv.price_per_share,
        status=inv.status,
        tx_signature=inv.tx_signature,
        created_at=inv.created_at,
    )


def _build_funding_round_response(fr: FundingRound) -> FundingRoundResponse:
    """Convert FundingRound model to response schema"""
    return FundingRoundResponse(
        id=fr.id,
        name=fr.name,
        round_type=fr.round_type,
        pre_money_valuation=fr.pre_money_valuation,
        amount_raised=fr.amount_raised,
        post_money_valuation=fr.post_money_valuation,
        price_per_share=fr.price_per_share,
        shares_issued=fr.shares_issued,
        share_class=_build_share_class_response(fr.share_class),
        status=fr.status,
        closed_at=fr.closed_at,
        investments=[_build_investment_response(inv) for inv in (fr.investments or [])],
        created_at=fr.created_at,
    )


@router.post("", response_model=FundingRoundResponse)
async def create_funding_round(
    request: CreateFundingRoundRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new funding round.

    The round starts in "pending" status. Add investments, then close the round
    to issue shares and update valuation.

    Price per share is calculated as: pre_money_valuation / total_shares
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Verify share class exists
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.id == request.share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    # Validate valuation
    if request.pre_money_valuation <= 0:
        raise HTTPException(status_code=400, detail="Pre-money valuation must be positive")

    # Calculate price per share based on current fully diluted shares
    fully_diluted_shares = token.total_supply or 1
    price_per_share = request.pre_money_valuation // fully_diluted_shares

    if price_per_share <= 0:
        price_per_share = 1  # Minimum 1 cent

    funding_round = FundingRound(
        token_id=token_id,
        name=request.name.strip(),
        round_type=request.round_type.value,
        pre_money_valuation=request.pre_money_valuation,
        amount_raised=0,
        post_money_valuation=request.pre_money_valuation,
        price_per_share=price_per_share,
        shares_issued=0,
        share_class_id=request.share_class_id,
        status="pending",
        notes=request.notes,
    )
    db.add(funding_round)
    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments)
        )
        .where(FundingRound.id == funding_round.id)
    )
    funding_round = result.scalar_one()

    return _build_funding_round_response(funding_round)


@router.get("", response_model=List[FundingRoundResponse])
async def list_funding_rounds(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """List all funding rounds for a token, newest first."""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments)
        )
        .where(FundingRound.token_id == token_id)
        .order_by(FundingRound.created_at.desc())
    )
    rounds = result.scalars().all()

    return [_build_funding_round_response(fr) for fr in rounds]


@router.get("/{round_id}", response_model=FundingRoundResponse)
async def get_funding_round(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific funding round by ID."""
    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments)
        )
        .where(
            FundingRound.token_id == token_id,
            FundingRound.id == round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    return _build_funding_round_response(funding_round)


@router.post("/{round_id}/investments", response_model=InvestmentResponse)
async def add_investment(
    request: AddInvestmentRequest,
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Add an investment to a pending funding round.

    Shares are calculated as: amount / price_per_share
    """
    # Get funding round
    result = await db.execute(
        select(FundingRound)
        .options(selectinload(FundingRound.share_class))
        .where(
            FundingRound.token_id == token_id,
            FundingRound.id == round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    if funding_round.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add investments to {funding_round.status} round"
        )

    # Validate amount
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Investment amount must be positive")

    # Validate wallet address format (basic check)
    if not request.investor_wallet or len(request.investor_wallet) < 32:
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    # Calculate shares
    shares_received = request.amount // funding_round.price_per_share
    if shares_received <= 0:
        raise HTTPException(
            status_code=400,
            detail="Investment amount too small for minimum share purchase"
        )

    # Create investment record
    investment = Investment(
        token_id=token_id,
        funding_round_id=round_id,
        investor_wallet=request.investor_wallet,
        investor_name=request.investor_name,
        amount=request.amount,
        shares_received=shares_received,
        price_per_share=funding_round.price_per_share,
        status="pending",
    )
    db.add(investment)

    # Update funding round totals
    funding_round.amount_raised += request.amount
    funding_round.shares_issued += shares_received
    funding_round.post_money_valuation = funding_round.pre_money_valuation + funding_round.amount_raised

    await db.commit()
    await db.refresh(investment)

    return _build_investment_response(investment)


@router.delete("/{round_id}/investments/{investment_id}")
async def remove_investment(
    token_id: int = Path(...),
    round_id: int = Path(...),
    investment_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Remove an investment from a pending funding round."""
    # Get funding round
    result = await db.execute(
        select(FundingRound).where(
            FundingRound.token_id == token_id,
            FundingRound.id == round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    if funding_round.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot remove investments from {funding_round.status} round"
        )

    # Get investment
    result = await db.execute(
        select(Investment).where(
            Investment.id == investment_id,
            Investment.funding_round_id == round_id
        )
    )
    investment = result.scalar_one_or_none()
    if not investment:
        raise HTTPException(status_code=404, detail="Investment not found")

    # Update funding round totals
    funding_round.amount_raised -= investment.amount
    funding_round.shares_issued -= investment.shares_received
    funding_round.post_money_valuation = funding_round.pre_money_valuation + funding_round.amount_raised

    await db.delete(investment)
    await db.commit()

    return {"message": "Investment removed successfully"}


@router.post("/{round_id}/close", response_model=FundingRoundResponse)
async def close_funding_round(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Close a funding round and issue shares to all investors.

    This will:
    1. Create/update share positions for each investor
    2. Update CurrentBalance for cap table compatibility
    3. Add investors to allowlist if not already on it
    4. Update token's total supply and valuation
    5. Create a valuation event
    """
    # Get funding round with all relationships
    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments),
        )
        .where(
            FundingRound.token_id == token_id,
            FundingRound.id == round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    if funding_round.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Round is already {funding_round.status}"
        )

    if not funding_round.investments:
        raise HTTPException(status_code=400, detail="No investments to close")

    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one()

    share_class = funding_round.share_class

    # Issue shares to each investor
    for investment in funding_round.investments:
        # Check if wallet is on allowlist, add if not
        result = await db.execute(
            select(Wallet).where(
                Wallet.token_id == token_id,
                Wallet.address == investment.investor_wallet
            )
        )
        wallet = result.scalar_one_or_none()
        if not wallet:
            wallet = Wallet(
                token_id=token_id,
                address=investment.investor_wallet,
                status="active",
                kyc_level=1,
                approved_at=datetime.utcnow(),
            )
            db.add(wallet)
        elif wallet.status != "active":
            wallet.status = "active"
            wallet.approved_at = datetime.utcnow()

        # Create or update share position
        result = await db.execute(
            select(SharePosition).where(
                SharePosition.token_id == token_id,
                SharePosition.share_class_id == share_class.id,
                SharePosition.wallet == investment.investor_wallet
            )
        )
        position = result.scalar_one_or_none()

        if position:
            # Update existing position (calculate weighted average cost)
            total_cost = position.cost_basis + investment.amount
            total_shares = position.shares + investment.shares_received
            position.shares = total_shares
            position.cost_basis = total_cost
            position.price_per_share = total_cost // total_shares if total_shares > 0 else 0
            position.updated_at = datetime.utcnow()
        else:
            # Create new position
            position = SharePosition(
                token_id=token_id,
                share_class_id=share_class.id,
                wallet=investment.investor_wallet,
                shares=investment.shares_received,
                cost_basis=investment.amount,
                price_per_share=investment.price_per_share,
            )
            db.add(position)

        # Update CurrentBalance for cap table compatibility
        result = await db.execute(
            select(CurrentBalance).where(
                CurrentBalance.token_id == token_id,
                CurrentBalance.wallet == investment.investor_wallet
            )
        )
        balance = result.scalar_one_or_none()
        if balance:
            balance.balance += investment.shares_received
            balance.updated_at = datetime.utcnow()
        else:
            balance = CurrentBalance(
                token_id=token_id,
                wallet=investment.investor_wallet,
                balance=investment.shares_received,
                last_updated_slot=0,
            )
            db.add(balance)

        investment.status = "completed"

    # Update token total supply
    token.total_supply = (token.total_supply or 0) + funding_round.shares_issued

    # Update token valuation
    token.current_valuation = funding_round.post_money_valuation
    token.current_price_per_share = funding_round.price_per_share
    token.last_valuation_date = datetime.utcnow()

    # Create valuation event
    valuation_event = ValuationEvent(
        token_id=token_id,
        event_type="funding_round",
        valuation=funding_round.post_money_valuation,
        price_per_share=funding_round.price_per_share,
        fully_diluted_shares=token.total_supply,
        funding_round_id=round_id,
        effective_date=datetime.utcnow(),
        notes=f"Closed {funding_round.name}",
    )
    db.add(valuation_event)

    # Update round status
    funding_round.status = "completed"
    funding_round.closed_at = datetime.utcnow()

    await db.commit()

    # Reload with fresh data
    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments)
        )
        .where(FundingRound.id == round_id)
    )
    funding_round = result.scalar_one()

    return _build_funding_round_response(funding_round)


@router.post("/{round_id}/cancel", response_model=FundingRoundResponse)
async def cancel_funding_round(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a pending funding round."""
    result = await db.execute(
        select(FundingRound)
        .options(
            selectinload(FundingRound.share_class),
            selectinload(FundingRound.investments)
        )
        .where(
            FundingRound.token_id == token_id,
            FundingRound.id == round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    if funding_round.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel {funding_round.status} round"
        )

    funding_round.status = "cancelled"
    for investment in funding_round.investments:
        investment.status = "cancelled"

    await db.commit()

    return _build_funding_round_response(funding_round)
