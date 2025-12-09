"""Convertible Instruments API endpoints"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.token import Token
from app.models.convertible import ConvertibleInstrument
from app.models.funding_round import FundingRound
from app.models.share_class import ShareClass, SharePosition
from app.models.snapshot import CurrentBalance
from app.models.wallet import Wallet
from app.schemas.investment import (
    CreateConvertibleRequest,
    ConvertibleResponse,
    ConvertConvertibleRequest,
)

router = APIRouter()


def _build_convertible_response(c: ConvertibleInstrument) -> ConvertibleResponse:
    """Convert ConvertibleInstrument model to response schema"""
    return ConvertibleResponse(
        id=c.id,
        instrument_type=c.instrument_type,
        name=c.name,
        holder_wallet=c.holder_wallet,
        holder_name=c.holder_name,
        principal_amount=c.principal_amount,
        accrued_amount=c.calculate_accrued_amount(),
        valuation_cap=c.valuation_cap,
        discount_rate=c.discount_rate,
        interest_rate=c.interest_rate,
        maturity_date=c.maturity_date,
        safe_type=c.safe_type,
        status=c.status,
        converted_at=c.converted_at,
        shares_received=c.shares_received,
        conversion_price=c.conversion_price,
        created_at=c.created_at,
    )


@router.post("", response_model=ConvertibleResponse)
async def create_convertible(
    request: CreateConvertibleRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new convertible instrument (SAFE or convertible note).

    SAFEs:
    - No interest
    - May have valuation cap and/or discount

    Convertible Notes:
    - Accrue interest over time
    - Have maturity date
    - May have valuation cap and/or discount
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate amount
    if request.principal_amount <= 0:
        raise HTTPException(status_code=400, detail="Principal amount must be positive")

    # Validate wallet address format
    if not request.holder_wallet or len(request.holder_wallet) < 32:
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    # Validate discount rate
    if request.discount_rate is not None:
        if request.discount_rate < 0 or request.discount_rate >= 1:
            raise HTTPException(
                status_code=400,
                detail="Discount rate must be between 0 and 1 (e.g., 0.20 for 20%)"
            )

    # Validate interest rate for notes
    if request.instrument_type.value == "convertible_note":
        if request.interest_rate is not None and request.interest_rate < 0:
            raise HTTPException(status_code=400, detail="Interest rate must be non-negative")

    # Validate valuation cap
    if request.valuation_cap is not None and request.valuation_cap <= 0:
        raise HTTPException(status_code=400, detail="Valuation cap must be positive")

    convertible = ConvertibleInstrument(
        token_id=token_id,
        instrument_type=request.instrument_type.value,
        name=request.name,
        holder_wallet=request.holder_wallet,
        holder_name=request.holder_name,
        principal_amount=request.principal_amount,
        valuation_cap=request.valuation_cap,
        discount_rate=request.discount_rate,
        interest_rate=request.interest_rate,
        maturity_date=request.maturity_date,
        safe_type=request.safe_type.value if request.safe_type else None,
        notes=request.notes,
        status="outstanding",
    )
    db.add(convertible)
    await db.commit()
    await db.refresh(convertible)

    return _build_convertible_response(convertible)


@router.get("", response_model=List[ConvertibleResponse])
async def list_convertibles(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """List all convertible instruments for a token."""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(ConvertibleInstrument)
        .where(ConvertibleInstrument.token_id == token_id)
        .order_by(ConvertibleInstrument.created_at.desc())
    )
    convertibles = result.scalars().all()

    return [_build_convertible_response(c) for c in convertibles]


@router.get("/outstanding", response_model=List[ConvertibleResponse])
async def list_outstanding_convertibles(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """List outstanding (not yet converted) convertibles."""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(ConvertibleInstrument)
        .where(
            ConvertibleInstrument.token_id == token_id,
            ConvertibleInstrument.status == "outstanding"
        )
        .order_by(ConvertibleInstrument.created_at.desc())
    )
    convertibles = result.scalars().all()

    return [_build_convertible_response(c) for c in convertibles]


@router.get("/{convertible_id}", response_model=ConvertibleResponse)
async def get_convertible(
    token_id: int = Path(...),
    convertible_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific convertible instrument."""
    result = await db.execute(
        select(ConvertibleInstrument).where(
            ConvertibleInstrument.token_id == token_id,
            ConvertibleInstrument.id == convertible_id
        )
    )
    convertible = result.scalar_one_or_none()
    if not convertible:
        raise HTTPException(status_code=404, detail="Convertible instrument not found")

    return _build_convertible_response(convertible)


@router.post("/{convertible_id}/convert", response_model=ConvertibleResponse)
async def convert_convertible(
    request: ConvertConvertibleRequest,
    token_id: int = Path(...),
    convertible_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Convert a convertible instrument at a funding round.

    Conversion price is the lower of:
    - Round price with discount applied
    - Valuation cap price (cap / pre-money shares)
    """
    # Get convertible
    result = await db.execute(
        select(ConvertibleInstrument).where(
            ConvertibleInstrument.token_id == token_id,
            ConvertibleInstrument.id == convertible_id
        )
    )
    convertible = result.scalar_one_or_none()
    if not convertible:
        raise HTTPException(status_code=404, detail="Convertible instrument not found")

    if convertible.status != "outstanding":
        raise HTTPException(
            status_code=400,
            detail=f"Convertible is already {convertible.status}"
        )

    # Get funding round
    result = await db.execute(
        select(FundingRound)
        .options(selectinload(FundingRound.share_class))
        .where(
            FundingRound.token_id == token_id,
            FundingRound.id == request.funding_round_id
        )
    )
    funding_round = result.scalar_one_or_none()
    if not funding_round:
        raise HTTPException(status_code=404, detail="Funding round not found")

    # Get token for share count
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one()

    # Calculate conversion price
    round_price = funding_round.price_per_share
    pre_money_shares = token.total_supply or 1

    conversion_price = convertible.calculate_conversion_price(round_price, pre_money_shares)

    # Calculate shares (use accrued amount for notes)
    amount_to_convert = convertible.calculate_accrued_amount()
    shares_received = amount_to_convert // conversion_price

    if shares_received <= 0:
        raise HTTPException(status_code=400, detail="Conversion would result in zero shares")

    # Use the same share class as the funding round
    share_class = funding_round.share_class

    # Check if wallet is on allowlist, add if not
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == convertible.holder_wallet
        )
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(
            token_id=token_id,
            address=convertible.holder_wallet,
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
            SharePosition.wallet == convertible.holder_wallet
        )
    )
    position = result.scalar_one_or_none()

    if position:
        total_cost = position.cost_basis + amount_to_convert
        total_shares = position.shares + shares_received
        position.shares = total_shares
        position.cost_basis = total_cost
        position.price_per_share = total_cost // total_shares if total_shares > 0 else 0
        position.updated_at = datetime.utcnow()
    else:
        position = SharePosition(
            token_id=token_id,
            share_class_id=share_class.id,
            wallet=convertible.holder_wallet,
            shares=shares_received,
            cost_basis=amount_to_convert,
            price_per_share=conversion_price,
        )
        db.add(position)

    # Update CurrentBalance for cap table compatibility
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == convertible.holder_wallet
        )
    )
    balance = result.scalar_one_or_none()
    if balance:
        balance.balance += shares_received
        balance.updated_at = datetime.utcnow()
    else:
        balance = CurrentBalance(
            token_id=token_id,
            wallet=convertible.holder_wallet,
            balance=shares_received,
            last_updated_slot=0,
        )
        db.add(balance)

    # Update token total supply
    token.total_supply = (token.total_supply or 0) + shares_received

    # Update convertible status
    convertible.status = "converted"
    convertible.converted_at = datetime.utcnow()
    convertible.conversion_round_id = funding_round.id
    convertible.shares_received = shares_received
    convertible.conversion_price = conversion_price

    await db.commit()
    await db.refresh(convertible)

    return _build_convertible_response(convertible)


@router.post("/{convertible_id}/cancel", response_model=ConvertibleResponse)
async def cancel_convertible(
    token_id: int = Path(...),
    convertible_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an outstanding convertible instrument."""
    result = await db.execute(
        select(ConvertibleInstrument).where(
            ConvertibleInstrument.token_id == token_id,
            ConvertibleInstrument.id == convertible_id
        )
    )
    convertible = result.scalar_one_or_none()
    if not convertible:
        raise HTTPException(status_code=404, detail="Convertible instrument not found")

    if convertible.status != "outstanding":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel {convertible.status} convertible"
        )

    convertible.status = "cancelled"
    convertible.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(convertible)

    return _build_convertible_response(convertible)
