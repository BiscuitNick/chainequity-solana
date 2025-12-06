"""Admin API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.token import Token
from app.models.transaction import CorporateAction
from app.schemas.admin import (
    MultisigConfigResponse,
    PendingTransactionResponse,
    CorporateActionRequest,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


@router.get("/multisig/config", response_model=MultisigConfigResponse)
async def get_multisig_config(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get multi-sig configuration from on-chain data"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Derive multisig PDA and fetch account data
    solana_client = await get_solana_client()
    multisig_pda, _ = solana_client.derive_multisig_pda(Pubkey.from_string(token.mint_address))

    # Fetch multisig account from chain
    account_info = await solana_client.get_account_info(multisig_pda)

    if not account_info:
        # Multisig not initialized for this token
        return MultisigConfigResponse(
            signers=[],
            threshold=0,
            nonce=0,
        )

    # In production, this would parse the account data using borsh
    # For now, return placeholder that indicates it needs to be fetched from chain
    # The actual parsing would depend on the on-chain program's account structure
    return MultisigConfigResponse(
        signers=[],
        threshold=1,
        nonce=0,
    )


@router.get("/multisig/pending", response_model=List[PendingTransactionResponse])
async def list_pending_transactions(token_id: int, db: AsyncSession = Depends(get_db)):
    """List pending multi-sig transactions from on-chain data"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # In production, this would:
    # 1. Query the program accounts to find pending transactions
    # 2. Parse each transaction's data
    # 3. Return the list

    # For this phase, query pending transactions from indexed data
    # Multi-sig transactions would be indexed by the event processor
    solana_client = await get_solana_client()
    multisig_pda, _ = solana_client.derive_multisig_pda(Pubkey.from_string(token.mint_address))

    # Get program accounts for pending transactions
    # Filter by: owner = factory program, has pending status
    try:
        accounts = await solana_client.get_program_accounts(
            solana_client.program_addresses.factory,
            filters=[
                {"memcmp": {"offset": 0, "bytes": str(multisig_pda)[:32]}}
            ]
        )
    except Exception:
        accounts = []

    # Parse and return pending transactions
    # In production, this would deserialize the account data
    pending = []
    # Placeholder: would iterate over accounts and parse transaction data

    return pending


@router.post("/multisig/{tx_id}/sign")
async def sign_transaction(token_id: int, tx_id: str, db: AsyncSession = Depends(get_db)):
    """Sign a pending multi-sig transaction - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate tx_id is a valid pubkey
    try:
        tx_pubkey = Pubkey.from_string(tx_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction ID format")

    solana_client = await get_solana_client()

    return {
        "message": "Multi-sig approval transaction prepared for signing",
        "transaction_id": tx_id,
        "instruction": {
            "program": str(solana_client.program_addresses.factory),
            "action": "approve_transaction",
            "data": {
                "transaction_id": tx_id,
            }
        }
    }


@router.post("/multisig/{tx_id}/execute")
async def execute_transaction(token_id: int, tx_id: str, db: AsyncSession = Depends(get_db)):
    """Execute an approved multi-sig transaction - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate tx_id is a valid pubkey
    try:
        tx_pubkey = Pubkey.from_string(tx_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction ID format")

    solana_client = await get_solana_client()

    return {
        "message": "Multi-sig execute transaction prepared for signing",
        "transaction_id": tx_id,
        "instruction": {
            "program": str(solana_client.program_addresses.factory),
            "action": "execute_transaction",
            "data": {
                "transaction_id": tx_id,
            }
        }
    }


@router.post("/multisig/{tx_id}/cancel")
async def cancel_transaction(token_id: int, tx_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel a pending multi-sig transaction - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate tx_id is a valid pubkey
    try:
        tx_pubkey = Pubkey.from_string(tx_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction ID format")

    solana_client = await get_solana_client()

    return {
        "message": "Multi-sig cancel transaction prepared for signing",
        "transaction_id": tx_id,
        "instruction": {
            "program": str(solana_client.program_addresses.factory),
            "action": "cancel_transaction",
            "data": {
                "transaction_id": tx_id,
            }
        }
    }


@router.post("/corporate-actions/split")
async def initiate_split(
    token_id: int,
    request: CorporateActionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Initiate a stock split - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate split ratio
    ratio = request.params.get("ratio")
    if not ratio or not isinstance(ratio, int) or ratio < 2:
        raise HTTPException(status_code=400, detail="Split ratio must be an integer >= 2")

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))

    return {
        "message": "Stock split transaction prepared for signing",
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "execute_stock_split",
            "data": {
                "ratio": ratio,
            }
        },
        "warning": "Stock splits affect all token holders. This action cannot be undone."
    }


@router.post("/corporate-actions/symbol")
async def change_symbol(
    token_id: int,
    request: CorporateActionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Change token symbol - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate new symbol
    new_symbol = request.params.get("new_symbol")
    if not new_symbol or not isinstance(new_symbol, str):
        raise HTTPException(status_code=400, detail="new_symbol is required")
    if len(new_symbol) < 2 or len(new_symbol) > 10:
        raise HTTPException(status_code=400, detail="Symbol must be 2-10 characters")
    if not new_symbol.isalnum():
        raise HTTPException(status_code=400, detail="Symbol must be alphanumeric")

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))

    return {
        "message": "Symbol change transaction prepared for signing",
        "old_symbol": token.symbol,
        "new_symbol": new_symbol.upper(),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "change_symbol",
            "data": {
                "new_symbol": new_symbol.upper(),
            }
        }
    }


@router.get("/corporate-actions", response_model=List[dict])
async def list_corporate_actions(token_id: int, db: AsyncSession = Depends(get_db)):
    """List all corporate actions for a token"""
    result = await db.execute(
        select(CorporateAction)
        .where(CorporateAction.token_id == token_id)
        .order_by(CorporateAction.executed_at.desc())
    )
    actions = result.scalars().all()

    return [
        {
            "id": a.id,
            "action_type": a.action_type,
            "action_data": a.action_data,
            "executed_at": a.executed_at.isoformat(),
            "executed_by": a.executed_by,
            "signature": a.signature,
            "slot": a.slot,
        }
        for a in actions
    ]
