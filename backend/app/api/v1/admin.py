"""Admin API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.models.database import get_db
from app.schemas.admin import (
    MultisigConfigResponse,
    PendingTransactionResponse,
    CorporateActionRequest,
)

router = APIRouter()


@router.get("/multisig/config", response_model=MultisigConfigResponse)
async def get_multisig_config(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get multi-sig configuration"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/multisig/pending", response_model=List[PendingTransactionResponse])
async def list_pending_transactions(token_id: int, db: AsyncSession = Depends(get_db)):
    """List pending multi-sig transactions"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/multisig/{tx_id}/sign")
async def sign_transaction(token_id: int, tx_id: str, db: AsyncSession = Depends(get_db)):
    """Sign a pending multi-sig transaction"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/corporate-actions/split")
async def initiate_split(
    token_id: int,
    request: CorporateActionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Initiate a stock split"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/corporate-actions/symbol")
async def change_symbol(
    token_id: int,
    request: CorporateActionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Change token symbol"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")
