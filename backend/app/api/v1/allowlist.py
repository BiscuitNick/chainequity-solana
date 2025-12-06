"""Allowlist API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.models.database import get_db
from app.models.wallet import Wallet
from app.models.token import Token
from app.schemas.allowlist import (
    AllowlistEntryResponse,
    ApproveWalletRequest,
    BulkApproveRequest,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

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
    """Add wallet to allowlist - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate wallet address format
    try:
        wallet_pubkey = Pubkey.from_string(request.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid wallet address format")

    # Check if wallet already on allowlist
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.address
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.status == "approved":
        raise HTTPException(status_code=400, detail="Wallet already on allowlist")

    # Build transaction data
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

    return {
        "message": "Allowlist approve transaction prepared for signing",
        "allowlist_pda": str(allowlist_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "update_allowlist",
            "data": {
                "wallet": request.address,
                "approved": True,
                "kyc_level": request.kyc_level if hasattr(request, 'kyc_level') else 1,
            }
        }
    }


@router.post("/revoke")
async def revoke_wallet(token_id: int, request: ApproveWalletRequest, db: AsyncSession = Depends(get_db)):
    """Remove wallet from allowlist - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate wallet address format
    try:
        wallet_pubkey = Pubkey.from_string(request.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid wallet address format")

    # Check if wallet is on allowlist
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.address
        )
    )
    existing = result.scalar_one_or_none()
    if not existing or existing.status != "approved":
        raise HTTPException(status_code=400, detail="Wallet not on allowlist")

    # Build transaction data
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

    return {
        "message": "Allowlist revoke transaction prepared for signing",
        "allowlist_pda": str(allowlist_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "update_allowlist",
            "data": {
                "wallet": request.address,
                "approved": False,
                "kyc_level": 0,
            }
        }
    }


@router.post("/bulk-approve")
async def bulk_approve(token_id: int, request: BulkApproveRequest, db: AsyncSession = Depends(get_db)):
    """Bulk approve multiple wallets - returns unsigned transactions for client signing"""
    # Get token
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

    for wallet_address in request.addresses:
        try:
            wallet_pubkey = Pubkey.from_string(wallet_address)
            allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

            instructions.append({
                "wallet": wallet_address,
                "allowlist_pda": str(allowlist_pda),
                "data": {
                    "approved": True,
                    "kyc_level": request.kyc_level if hasattr(request, 'kyc_level') else 1,
                }
            })
        except Exception as e:
            errors.append({
                "wallet": wallet_address,
                "error": str(e)
            })

    return {
        "message": f"Bulk approve prepared: {len(instructions)} valid, {len(errors)} errors",
        "program": str(solana_client.program_addresses.token),
        "action": "bulk_update_allowlist",
        "instructions": instructions,
        "errors": errors
    }
