"""Unified Transaction API endpoints for recording and querying transactions."""
from datetime import datetime
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.token import Token
from app.models.unified_transaction import UnifiedTransaction, TransactionType
from app.services.transaction_service import TransactionService

router = APIRouter()


class RecordTransactionRequest(BaseModel):
    """Request to record a transaction."""
    tx_type: str  # TransactionType enum value
    slot: int
    wallet: Optional[str] = None
    wallet_to: Optional[str] = None
    amount: Optional[int] = None
    amount_secondary: Optional[int] = None
    share_class_id: Optional[int] = None
    priority: Optional[int] = None
    preference_multiple: Optional[float] = None
    reference_id: Optional[int] = None
    reference_type: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    triggered_by: Optional[str] = None
    notes: Optional[str] = None
    tx_signature: Optional[str] = None


class TransactionResponse(BaseModel):
    """Transaction response model."""
    id: int
    token_id: int
    slot: int
    tx_type: str
    wallet: Optional[str]
    wallet_to: Optional[str]
    amount: Optional[int]
    amount_secondary: Optional[int]
    share_class_id: Optional[int]
    priority: Optional[int]
    preference_multiple: Optional[float]
    reference_id: Optional[int]
    reference_type: Optional[str]
    data: Optional[Dict[str, Any]]
    triggered_by: Optional[str]
    notes: Optional[str]
    tx_signature: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=TransactionResponse)
async def record_transaction(
    request: RecordTransactionRequest,
    token_id: int = Path(..., description="Token ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a transaction to the unified transaction history.

    This endpoint is primarily for administrative/testing purposes.
    In production, transactions are typically recorded automatically
    when on-chain events occur.
    """
    # Validate token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail=f"Token {token_id} not found")

    # Parse transaction type
    try:
        tx_type = TransactionType(request.tx_type)
    except ValueError:
        valid_types = [t.value for t in TransactionType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tx_type '{request.tx_type}'. Valid types: {valid_types}"
        )

    # Record the transaction
    tx_service = TransactionService(db)
    tx = await tx_service.record(
        token_id=token_id,
        tx_type=tx_type,
        slot=request.slot,
        wallet=request.wallet,
        wallet_to=request.wallet_to,
        amount=request.amount,
        amount_secondary=request.amount_secondary,
        share_class_id=request.share_class_id,
        priority=request.priority,
        preference_multiple=request.preference_multiple,
        reference_id=request.reference_id,
        reference_type=request.reference_type,
        data=request.data,
        triggered_by=request.triggered_by,
        notes=request.notes,
        tx_signature=request.tx_signature,
    )
    await db.commit()
    await db.refresh(tx)

    return TransactionResponse(
        id=tx.id,
        token_id=tx.token_id,
        slot=tx.slot,
        tx_type=tx.tx_type.value,
        wallet=tx.wallet,
        wallet_to=tx.wallet_to,
        amount=tx.amount,
        amount_secondary=tx.amount_secondary,
        share_class_id=tx.share_class_id,
        priority=tx.priority,
        preference_multiple=tx.preference_multiple,
        reference_id=tx.reference_id,
        reference_type=tx.reference_type,
        data=tx.data,
        triggered_by=tx.triggered_by,
        notes=tx.notes,
        tx_signature=tx.tx_signature,
        created_at=tx.created_at,
    )


@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    token_id: int = Path(..., description="Token ID"),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    tx_type: Optional[str] = Query(None, description="Filter by transaction type"),
    wallet: Optional[str] = Query(None, description="Filter by wallet address"),
    from_slot: Optional[int] = Query(None, description="Filter from slot (inclusive)"),
    to_slot: Optional[int] = Query(None, description="Filter to slot (inclusive)"),
    db: AsyncSession = Depends(get_db),
):
    """
    List transactions for a token with optional filters.
    """
    # Validate token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail=f"Token {token_id} not found")

    # Build query
    query = select(UnifiedTransaction).where(
        UnifiedTransaction.token_id == token_id
    )

    if tx_type:
        try:
            tx_type_enum = TransactionType(tx_type)
            query = query.where(UnifiedTransaction.tx_type == tx_type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid tx_type: {tx_type}")

    if wallet:
        from sqlalchemy import or_
        query = query.where(
            or_(
                UnifiedTransaction.wallet == wallet,
                UnifiedTransaction.wallet_to == wallet,
            )
        )

    if from_slot is not None:
        query = query.where(UnifiedTransaction.slot >= from_slot)

    if to_slot is not None:
        query = query.where(UnifiedTransaction.slot <= to_slot)

    query = query.order_by(UnifiedTransaction.slot.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    transactions = result.scalars().all()

    return [
        TransactionResponse(
            id=tx.id,
            token_id=tx.token_id,
            slot=tx.slot,
            tx_type=tx.tx_type.value,
            wallet=tx.wallet,
            wallet_to=tx.wallet_to,
            amount=tx.amount,
            amount_secondary=tx.amount_secondary,
            share_class_id=tx.share_class_id,
            priority=tx.priority,
            preference_multiple=tx.preference_multiple,
            reference_id=tx.reference_id,
            reference_type=tx.reference_type,
            data=tx.data,
            triggered_by=tx.triggered_by,
            notes=tx.notes,
            tx_signature=tx.tx_signature,
            created_at=tx.created_at,
        )
        for tx in transactions
    ]


@router.get("/activity")
async def get_activity_feed(
    token_id: int = Path(..., description="Token ID"),
    limit: int = Query(50, ge=1, le=100),
    before_slot: Optional[int] = Query(None, description="Get activity before this slot"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get activity feed for a token (recent transactions in human-readable format).
    """
    # Validate token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail=f"Token {token_id} not found")

    tx_service = TransactionService(db)
    transactions = await tx_service.get_activity(
        token_id=token_id,
        limit=limit,
        before_slot=before_slot,
    )

    # Format as activity items
    activities = []
    for tx in transactions:
        activity = {
            "id": tx.id,
            "slot": tx.slot,
            "type": tx.tx_type.value,
            "timestamp": tx.block_time.isoformat() if tx.block_time else tx.created_at.isoformat(),
            "description": _format_activity_description(tx),
            "wallet": tx.wallet,
            "wallet_to": tx.wallet_to,
            "amount": tx.amount,
        }
        activities.append(activity)

    return {
        "token_id": token_id,
        "count": len(activities),
        "activities": activities,
    }


def _format_activity_description(tx: UnifiedTransaction) -> str:
    """Format a transaction as a human-readable description."""
    tx_type = tx.tx_type
    wallet_short = tx.wallet[:8] + "..." if tx.wallet else "Unknown"

    if tx_type == TransactionType.APPROVAL:
        return f"Wallet {wallet_short} approved for trading"
    elif tx_type == TransactionType.REVOCATION:
        return f"Wallet {wallet_short} access revoked"
    elif tx_type == TransactionType.SHARE_GRANT:
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Granted {amount} shares to {wallet_short}"
    elif tx_type == TransactionType.TRANSFER:
        to_short = tx.wallet_to[:8] + "..." if tx.wallet_to else "Unknown"
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Transfer of {amount} shares from {wallet_short} to {to_short}"
    elif tx_type == TransactionType.STOCK_SPLIT:
        data = tx.data or {}
        ratio = f"{data.get('numerator', '?')}:{data.get('denominator', '?')}"
        return f"Stock split {ratio} executed"
    elif tx_type == TransactionType.SYMBOL_CHANGE:
        data = tx.data or {}
        old = data.get('old_symbol', '?')
        new = data.get('new_symbol', '?')
        return f"Symbol changed from {old} to {new}"
    elif tx_type == TransactionType.PROPOSAL_CREATE:
        return f"Governance proposal created by {wallet_short}"
    elif tx_type == TransactionType.VOTE:
        return f"Vote cast by {wallet_short}"
    elif tx_type == TransactionType.PROPOSAL_EXECUTE:
        return "Governance proposal executed"
    elif tx_type == TransactionType.VESTING_SCHEDULE_CREATE:
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Vesting schedule created for {wallet_short} ({amount} shares)"
    elif tx_type == TransactionType.VESTING_RELEASE:
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Vested shares released to {wallet_short} ({amount})"
    elif tx_type == TransactionType.MINT:
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Minted {amount} tokens"
    elif tx_type == TransactionType.BURN:
        amount = f"{tx.amount:,}" if tx.amount else "?"
        return f"Burned {amount} tokens"
    else:
        return f"{tx_type.value} transaction"
