"""Valuations API endpoints"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db
from app.models.token import Token
from app.models.valuation import ValuationEvent
from app.schemas.investment import CreateValuationRequest, ValuationResponse

router = APIRouter()


def _build_valuation_response(v: ValuationEvent) -> ValuationResponse:
    """Convert ValuationEvent model to response schema"""
    return ValuationResponse(
        id=v.id,
        event_type=v.event_type,
        valuation=v.valuation,
        price_per_share=v.price_per_share,
        fully_diluted_shares=v.fully_diluted_shares,
        funding_round_id=v.funding_round_id,
        effective_date=v.effective_date,
        notes=v.notes,
        created_at=v.created_at,
    )


@router.post("", response_model=ValuationResponse)
async def create_valuation(
    request: CreateValuationRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a manual valuation event.

    Use this for:
    - 409A valuations (formal appraisals)
    - Manual valuation updates between rounds
    - Initial valuation before first funding round

    Price per share is calculated as: valuation / total_shares
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate valuation
    if request.valuation <= 0:
        raise HTTPException(status_code=400, detail="Valuation must be positive")

    # Validate event type
    valid_types = ["manual", "409a"]
    if request.event_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Event type must be one of: {', '.join(valid_types)}"
        )

    # Calculate price per share
    fully_diluted_shares = token.total_supply or 1
    price_per_share = request.valuation // fully_diluted_shares

    if price_per_share <= 0:
        price_per_share = 1

    # Create valuation event
    valuation_event = ValuationEvent(
        token_id=token_id,
        event_type=request.event_type,
        valuation=request.valuation,
        price_per_share=price_per_share,
        fully_diluted_shares=fully_diluted_shares,
        effective_date=datetime.utcnow(),
        notes=request.notes,
    )
    db.add(valuation_event)

    # Update token's current valuation
    token.current_valuation = request.valuation
    token.current_price_per_share = price_per_share
    token.last_valuation_date = datetime.utcnow()

    await db.commit()
    await db.refresh(valuation_event)

    return _build_valuation_response(valuation_event)


@router.get("", response_model=List[ValuationResponse])
async def list_valuations(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """List all valuation events for a token (historical), newest first."""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(ValuationEvent)
        .where(ValuationEvent.token_id == token_id)
        .order_by(ValuationEvent.effective_date.desc())
    )
    valuations = result.scalars().all()

    return [_build_valuation_response(v) for v in valuations]


@router.get("/current", response_model=ValuationResponse)
async def get_current_valuation(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get the most recent valuation for a token."""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(ValuationEvent)
        .where(ValuationEvent.token_id == token_id)
        .order_by(ValuationEvent.effective_date.desc())
        .limit(1)
    )
    valuation = result.scalar_one_or_none()
    if not valuation:
        raise HTTPException(status_code=404, detail="No valuation found for this token")

    return _build_valuation_response(valuation)


@router.get("/{valuation_id}", response_model=ValuationResponse)
async def get_valuation(
    token_id: int = Path(...),
    valuation_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific valuation event by ID."""
    result = await db.execute(
        select(ValuationEvent).where(
            ValuationEvent.token_id == token_id,
            ValuationEvent.id == valuation_id
        )
    )
    valuation = result.scalar_one_or_none()
    if not valuation:
        raise HTTPException(status_code=404, detail="Valuation not found")

    return _build_valuation_response(valuation)
