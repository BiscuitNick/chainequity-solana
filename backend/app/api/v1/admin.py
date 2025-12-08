"""Admin API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.token import Token
from app.models.transaction import CorporateAction
from app.models.snapshot import CurrentBalance
from app.models.vesting import VestingSchedule
from app.schemas.admin import (
    MultisigConfigResponse,
    PendingTransactionResponse,
    CorporateActionRequest,
    ExecuteSplitRequest,
    ChangeSymbolRequest,
    UpdateThresholdRequest,
    PauseRequest,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


@router.get("/multisig/config", response_model=MultisigConfigResponse)
async def get_multisig_config(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
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
async def list_pending_transactions(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
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
async def sign_transaction(token_id: int = Path(...), tx_id: str = Path(...), db: AsyncSession = Depends(get_db)):
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
async def execute_transaction(token_id: int = Path(...), tx_id: str = Path(...), db: AsyncSession = Depends(get_db)):
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
async def cancel_transaction(token_id: int = Path(...), tx_id: str = Path(...), db: AsyncSession = Depends(get_db)):
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


@router.post("/multisig/threshold")
async def update_threshold(
    request: UpdateThresholdRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Update multi-sig threshold - returns unsigned transaction for client signing"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate threshold
    if request.threshold < 1:
        raise HTTPException(status_code=400, detail="Threshold must be at least 1")

    solana_client = await get_solana_client()
    multisig_pda, _ = solana_client.derive_multisig_pda(Pubkey.from_string(token.mint_address))

    return {
        "message": "Multi-sig threshold update transaction prepared for signing",
        "new_threshold": request.threshold,
        "instruction": {
            "program": str(solana_client.program_addresses.factory),
            "action": "update_threshold",
            "data": {
                "threshold": request.threshold,
            }
        }
    }


@router.post("/pause")
async def set_paused(
    request: PauseRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Pause or unpause token transfers"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Update the paused state
    token.is_paused = request.paused
    await db.commit()

    action = "paused" if request.paused else "resumed"

    return {
        "success": True,
        "message": f"Token transfers have been {action}",
        "is_paused": token.is_paused,
    }


@router.post("/corporate-actions/split")
async def initiate_split(
    request: CorporateActionRequest,
    token_id: int = Path(...),
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
    request: CorporateActionRequest,
    token_id: int = Path(...),
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

    # Check for duplicate symbol
    new_symbol_upper = new_symbol.upper()
    existing = await db.execute(
        select(Token).where(
            Token.symbol == new_symbol_upper,
            Token.token_id != token_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Symbol '{new_symbol_upper}' is already in use by another token")

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))

    return {
        "message": "Symbol change transaction prepared for signing",
        "old_symbol": token.symbol,
        "new_symbol": new_symbol_upper,
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "change_symbol",
            "data": {
                "new_symbol": new_symbol_upper,
            }
        }
    }


@router.get("/corporate-actions", response_model=List[dict])
async def list_corporate_actions(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
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


@router.post("/execute-split")
async def execute_split(
    request: ExecuteSplitRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Execute a stock split - updates all holder balances"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate split ratio
    if request.numerator < 1:
        raise HTTPException(status_code=400, detail="Numerator must be >= 1")
    if request.denominator < 1:
        raise HTTPException(status_code=400, detail="Denominator must be >= 1")
    if request.numerator == request.denominator:
        raise HTTPException(status_code=400, detail="Split ratio cannot be 1:1")

    # Get all current balances for this token
    result = await db.execute(
        select(CurrentBalance).where(CurrentBalance.token_id == token_id)
    )
    balances = result.scalars().all()

    # Apply split ratio to all balances
    old_total_supply = token.total_supply or 0
    for balance in balances:
        # For a 2:1 split, multiply by 2 and divide by 1
        # For a 1:2 reverse split, multiply by 1 and divide by 2
        new_balance = (balance.balance * request.numerator) // request.denominator
        balance.balance = new_balance
        balance.updated_at = datetime.utcnow()

    # Get all vesting schedules for this token and apply split
    result = await db.execute(
        select(VestingSchedule).where(VestingSchedule.token_id == token_id)
    )
    vesting_schedules = result.scalars().all()

    for schedule in vesting_schedules:
        # Update total_amount
        schedule.total_amount = (schedule.total_amount * request.numerator) // request.denominator
        # Update released_amount
        schedule.released_amount = (schedule.released_amount * request.numerator) // request.denominator
        # Update vested_at_termination if set
        if schedule.vested_at_termination is not None:
            schedule.vested_at_termination = (schedule.vested_at_termination * request.numerator) // request.denominator

    # Update token total supply
    new_total_supply = (old_total_supply * request.numerator) // request.denominator
    token.total_supply = new_total_supply

    # Determine action type
    action_type = "stock_split" if request.numerator > request.denominator else "reverse_split"

    # Get current slot from Solana
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    # Record the corporate action
    corporate_action = CorporateAction(
        token_id=token_id,
        action_type=action_type,
        action_data={
            "numerator": request.numerator,
            "denominator": request.denominator,
            "old_total_supply": old_total_supply,
            "new_total_supply": new_total_supply,
        },
        executed_at=datetime.utcnow(),
        executed_by="system",  # Would be wallet address in production
        signature="local-execution",  # Would be transaction signature in production
        slot=current_slot,
    )
    db.add(corporate_action)

    await db.commit()

    return {
        "success": True,
        "message": f"Stock split executed: {request.numerator}:{request.denominator}",
        "action_type": action_type,
        "old_total_supply": old_total_supply,
        "new_total_supply": new_total_supply,
    }


@router.post("/change-symbol")
async def execute_change_symbol(
    request: ChangeSymbolRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Execute a symbol change"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate new symbol
    new_symbol = request.new_symbol.strip().upper()
    if len(new_symbol) < 2 or len(new_symbol) > 10:
        raise HTTPException(status_code=400, detail="Symbol must be 2-10 characters")
    if not new_symbol.isalnum():
        raise HTTPException(status_code=400, detail="Symbol must be alphanumeric")

    # Check for duplicate symbol
    existing = await db.execute(
        select(Token).where(
            Token.symbol == new_symbol,
            Token.token_id != token_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Symbol '{new_symbol}' is already in use by another token")

    old_symbol = token.symbol

    # Update the symbol
    token.symbol = new_symbol

    # Get current slot from Solana
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    # Record the corporate action
    corporate_action = CorporateAction(
        token_id=token_id,
        action_type="symbol_change",
        action_data={
            "old_symbol": old_symbol,
            "new_symbol": new_symbol,
        },
        executed_at=datetime.utcnow(),
        executed_by="system",  # Would be wallet address in production
        signature="local-execution",  # Would be transaction signature in production
        slot=current_slot,
    )
    db.add(corporate_action)

    await db.commit()

    return {
        "success": True,
        "message": f"Symbol changed from {old_symbol} to {new_symbol}",
        "old_symbol": old_symbol,
        "new_symbol": new_symbol,
    }
