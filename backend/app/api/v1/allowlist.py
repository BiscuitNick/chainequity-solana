"""Allowlist API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.models.database import get_db
from app.models.wallet import Wallet
from app.schemas.allowlist import (
    AllowlistEntryResponse,
    ApproveWalletRequest,
    BulkApproveRequest,
)

router = APIRouter()


@router.get("", response_model=List[AllowlistEntryResponse])
async def get_allowlist(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get all wallets on allowlist"""
    result = await db.execute(
        select(Wallet).where(Wallet.token_id == token_id)
    )
    wallets = result.scalars().all()

    return [
        AllowlistEntryResponse(
            address=w.address,
            status=w.status,
            kyc_level=w.kyc_level,
            approved_at=w.approved_at,
            approved_by=w.approved_by,
        )
        for w in wallets
    ]


@router.get("/{address}", response_model=AllowlistEntryResponse)
async def get_wallet_status(token_id: int, address: str, db: AsyncSession = Depends(get_db)):
    """Get specific wallet allowlist status"""
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == address
        )
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not on allowlist")

    return AllowlistEntryResponse(
        address=wallet.address,
        status=wallet.status,
        kyc_level=wallet.kyc_level,
        approved_at=wallet.approved_at,
        approved_by=wallet.approved_by,
    )


@router.post("/approve")
async def approve_wallet(token_id: int, request: ApproveWalletRequest, db: AsyncSession = Depends(get_db)):
    """Add wallet to allowlist"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/revoke")
async def revoke_wallet(token_id: int, request: ApproveWalletRequest, db: AsyncSession = Depends(get_db)):
    """Remove wallet from allowlist"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/bulk-approve")
async def bulk_approve(token_id: int, request: BulkApproveRequest, db: AsyncSession = Depends(get_db)):
    """Bulk approve multiple wallets"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Requires Solana interaction")
