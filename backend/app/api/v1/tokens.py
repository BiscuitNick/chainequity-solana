"""Token operations API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.schemas.token import MintRequest, TransferRequest, TokenInfoResponse, BalanceResponse

router = APIRouter()


@router.get("/{token_id}/info", response_model=TokenInfoResponse)
async def get_token_info(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get token info"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{token_id}/balance/{address}", response_model=BalanceResponse)
async def get_balance(token_id: int, address: str, db: AsyncSession = Depends(get_db)):
    """Get wallet balance"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/{token_id}/mint")
async def mint_tokens(token_id: int, request: MintRequest, db: AsyncSession = Depends(get_db)):
    """Mint tokens to an approved wallet"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/{token_id}/transfer")
async def transfer_tokens(token_id: int, request: TransferRequest, db: AsyncSession = Depends(get_db)):
    """Transfer tokens between approved wallets"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")
