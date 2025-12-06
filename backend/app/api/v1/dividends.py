"""Dividends API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.models.database import get_db
from app.schemas.dividend import (
    DividendRoundResponse,
    CreateDividendRequest,
    UnclaimedDividendsResponse,
)

router = APIRouter()


@router.get("", response_model=List[DividendRoundResponse])
async def list_dividend_rounds(token_id: int, db: AsyncSession = Depends(get_db)):
    """List all dividend rounds"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{round_id}", response_model=DividendRoundResponse)
async def get_dividend_round(token_id: int, round_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific dividend round"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("")
async def create_dividend_round(
    token_id: int,
    request: CreateDividendRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new dividend round"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/{round_id}/claim")
async def claim_dividend(token_id: int, round_id: int, db: AsyncSession = Depends(get_db)):
    """Claim dividend for a round"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.get("/unclaimed/{address}", response_model=UnclaimedDividendsResponse)
async def get_unclaimed_dividends(
    token_id: int,
    address: str,
    db: AsyncSession = Depends(get_db)
):
    """Get unclaimed dividends for a wallet"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")
