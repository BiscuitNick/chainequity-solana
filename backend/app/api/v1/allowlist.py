"""Allowlist API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.wallet import Wallet
from app.models.token import Token
from app.schemas.allowlist import (
    AllowlistEntryResponse,
    AddWalletRequest,
    ApproveWalletRequest,
    BulkApproveRequest,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


@router.get("", response_model=List[AllowlistEntryResponse])
async def get_allowlist(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
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
            added_at=w.created_at.isoformat() if w.created_at else None,
            approved_at=w.approved_at,
            approved_by=w.approved_by,
        )
        for w in wallets
    ]


@router.get("/{address}", response_model=AllowlistEntryResponse)
async def get_wallet_status(token_id: int = Path(...), address: str = Path(...), db: AsyncSession = Depends(get_db)):
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
        added_at=wallet.created_at.isoformat() if wallet.created_at else None,
        approved_at=wallet.approved_at,
        approved_by=wallet.approved_by,
    )


@router.post("")
async def add_wallet(request: AddWalletRequest, token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Add a wallet to the allowlist (pending status)"""
    # Get token - token_id in URL is the business token_id, not the internal id
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate wallet address format
    try:
        Pubkey.from_string(request.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid wallet address format")

    # Check if wallet already exists
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.address
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Wallet already on allowlist with status: {existing.status}")

    # Create wallet entry with pending status
    wallet = Wallet(
        token_id=token_id,
        address=request.address,
        kyc_level=request.kyc_level,
        status="pending",
    )
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)

    return {
        "message": "Wallet added to allowlist",
        "address": wallet.address,
        "status": wallet.status,
        "kyc_level": wallet.kyc_level,
    }


@router.post("/approve")
async def approve_wallet(request: ApproveWalletRequest, token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Approve a wallet on the allowlist - changes status to active"""
    # Get token - token_id in URL is the business token_id, not the internal id
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

    # Check if wallet exists on allowlist
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.address
        )
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        # Create and approve in one step if not exists
        wallet = Wallet(
            token_id=token_id,
            address=request.address,
            kyc_level=request.kyc_level,
            status="active",
            approved_at=datetime.utcnow(),
        )
        db.add(wallet)
    elif wallet.status == "active":
        raise HTTPException(status_code=400, detail="Wallet already approved")
    else:
        # Update existing wallet to active
        wallet.status = "active"
        wallet.kyc_level = request.kyc_level
        wallet.approved_at = datetime.utcnow()

    await db.commit()
    await db.refresh(wallet)

    # Build transaction data for on-chain approval
    # Wrap in try/catch so Solana client errors don't fail the response
    # after the wallet has already been approved in the database
    response = {
        "message": "Wallet approved on allowlist",
        "address": wallet.address,
        "status": wallet.status,
        "kyc_level": wallet.kyc_level,
    }

    try:
        solana_client = await get_solana_client()
        token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
        allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

        response["allowlist_pda"] = str(allowlist_pda)
        response["instruction"] = {
            "program": str(solana_client.program_addresses.token),
            "action": "update_allowlist",
            "data": {
                "wallet": request.address,
                "approved": True,
                "kyc_level": request.kyc_level,
            }
        }
    except Exception:
        # Solana client error - wallet is still approved in DB
        # Just omit the on-chain instruction data from response
        pass

    return response


@router.post("/revoke")
async def revoke_wallet(request: ApproveWalletRequest, token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Revoke a wallet from allowlist - changes status to revoked"""
    # Get token - token_id in URL is the business token_id, not the internal id
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
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=400, detail="Wallet not on allowlist")
    if wallet.status == "revoked":
        raise HTTPException(status_code=400, detail="Wallet already revoked")

    # Update wallet status
    wallet.status = "revoked"
    await db.commit()

    # Build transaction data
    # Wrap in try/catch so Solana client errors don't fail the response
    response = {
        "message": "Wallet revoked from allowlist",
        "address": wallet.address,
        "status": wallet.status,
    }

    try:
        solana_client = await get_solana_client()
        token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
        allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

        response["allowlist_pda"] = str(allowlist_pda)
        response["instruction"] = {
            "program": str(solana_client.program_addresses.token),
            "action": "update_allowlist",
            "data": {
                "wallet": request.address,
                "approved": False,
                "kyc_level": 0,
            }
        }
    except Exception:
        # Solana client error - wallet is still revoked in DB
        pass

    return response


@router.post("/bulk-approve")
async def bulk_approve(request: BulkApproveRequest, token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Bulk approve multiple wallets"""
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

    for wallet_address in request.addresses:
        try:
            wallet_pubkey = Pubkey.from_string(wallet_address)
            allowlist_pda, _ = solana_client.derive_allowlist_pda(token_config_pda, wallet_pubkey)

            # Check/update in database
            result = await db.execute(
                select(Wallet).where(
                    Wallet.token_id == token_id,
                    Wallet.address == wallet_address
                )
            )
            wallet = result.scalar_one_or_none()

            if not wallet:
                wallet = Wallet(
                    token_id=token_id,
                    address=wallet_address,
                    kyc_level=request.kyc_level,
                    status="active",
                    approved_at=datetime.utcnow(),
                )
                db.add(wallet)
            elif wallet.status != "active":
                wallet.status = "active"
                wallet.kyc_level = request.kyc_level
                wallet.approved_at = datetime.utcnow()

            instructions.append({
                "wallet": wallet_address,
                "allowlist_pda": str(allowlist_pda),
                "data": {
                    "approved": True,
                    "kyc_level": request.kyc_level,
                }
            })
        except Exception as e:
            errors.append({
                "wallet": wallet_address,
                "error": str(e)
            })

    await db.commit()

    return {
        "message": f"Bulk approve prepared: {len(instructions)} valid, {len(errors)} errors",
        "program": str(solana_client.program_addresses.token),
        "action": "bulk_update_allowlist",
        "instructions": instructions,
        "errors": errors
    }


@router.delete("/{address}")
async def remove_wallet(token_id: int = Path(...), address: str = Path(...), db: AsyncSession = Depends(get_db)):
    """Remove a wallet from the allowlist entirely"""
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == address
        )
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not on allowlist")

    await db.delete(wallet)
    await db.commit()

    return {
        "message": "Wallet removed from allowlist",
        "address": address
    }
