"""Allowlist API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.wallet import Wallet
from app.models.token import Token
from app.models.history import ChangeType
from app.schemas.allowlist import (
    AllowlistEntryResponse,
    AddWalletRequest,
    ApproveWalletRequest,
    BulkApproveRequest,
)
from app.services.solana_client import get_solana_client
from app.services.history import HistoryService
from app.services.transaction_service import TransactionService
from app.models.unified_transaction import TransactionType
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
        status="pending",
    )
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)

    return {
        "message": "Wallet added to allowlist",
        "address": wallet.address,
        "status": wallet.status,
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

    # Initialize history service for tracking
    history_service = HistoryService(db)
    old_status = wallet.status if wallet else None

    if not wallet:
        # Create and approve in one step if not exists
        wallet = Wallet(
            token_id=token_id,
            address=request.address,
            status="active",
            approved_at=datetime.utcnow(),
        )
        db.add(wallet)
        await db.flush()  # Get the ID assigned

        # Record creation
        await history_service.record_model_change(
            wallet,
            ChangeType.CREATE,
            triggered_by="api:approve_wallet",
        )
    elif wallet.status == "active":
        raise HTTPException(status_code=400, detail="Wallet already approved")
    else:
        # Capture old state before update
        from app.services.history import model_to_dict
        old_state = model_to_dict(wallet)

        # Update existing wallet to active
        wallet.status = "active"
        wallet.approved_at = datetime.utcnow()

        # Record the update
        await history_service.record_change(
            entity_type="wallets",
            entity_id=str(wallet.id),
            change_type=ChangeType.UPDATE,
            old_state=old_state,
            new_state=model_to_dict(wallet),
            token_id=token_id,
            triggered_by="api:approve_wallet",
        )

    # Record approval transaction
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.APPROVAL,
        wallet=request.address,
        triggered_by="api:approve_wallet",
        data={"previous_status": old_status},
    )

    await db.commit()
    await db.refresh(wallet)

    # Build transaction data for on-chain approval
    # Wrap in try/catch so Solana client errors don't fail the response
    # after the wallet has already been approved in the database
    response = {
        "message": "Wallet approved on allowlist",
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
                "approved": True,
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
    old_status = wallet.status
    wallet.status = "revoked"

    # Record revocation transaction
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.REVOCATION,
        wallet=request.address,
        triggered_by="api:revoke_wallet",
        data={"previous_status": old_status},
    )

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

    tx_service = TransactionService(db)
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
            old_status = wallet.status if wallet else None

            if not wallet:
                wallet = Wallet(
                    token_id=token_id,
                    address=wallet_address,
                    status="active",
                    approved_at=datetime.utcnow(),
                )
                db.add(wallet)
            elif wallet.status != "active":
                wallet.status = "active"
                wallet.approved_at = datetime.utcnow()

            # Record approval transaction
            await tx_service.record(
                token_id=token_id,
                tx_type=TransactionType.APPROVAL,
                wallet=wallet_address,
                triggered_by="api:bulk_approve",
                data={"previous_status": old_status},
            )

            instructions.append({
                "wallet": wallet_address,
                "allowlist_pda": str(allowlist_pda),
                "data": {
                    "approved": True,
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
