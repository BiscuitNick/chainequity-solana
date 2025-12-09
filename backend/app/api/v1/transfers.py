"""Transfer API endpoints"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.token import Token
from app.models.transaction import Transfer
from app.schemas.transfer import (
    TransferResponse,
    TransferListResponse,
    TransferStatsResponse,
)

router = APIRouter()


@router.get("/{token_id}/transfers", response_model=TransferListResponse)
async def get_transfers(
    token_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get transfer history for a token"""
    # Verify token exists
    result = await db.execute(select(Token).where(Token.token_id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Get total count
    count_result = await db.execute(
        select(func.count()).select_from(Transfer).where(Transfer.token_id == token_id)
    )
    total = count_result.scalar() or 0

    # Get transfers
    result = await db.execute(
        select(Transfer)
        .where(Transfer.token_id == token_id)
        .order_by(Transfer.block_time.desc())
        .offset(skip)
        .limit(limit)
    )
    transfers = result.scalars().all()

    return TransferListResponse(
        transfers=[TransferResponse.model_validate(t) for t in transfers],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{token_id}/transfers/stats", response_model=TransferStatsResponse)
async def get_transfer_stats(
    token_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get transfer statistics for a token"""
    # Verify token exists
    result = await db.execute(select(Token).where(Token.token_id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Get total transfers
    total_result = await db.execute(
        select(func.count()).select_from(Transfer).where(Transfer.token_id == token_id)
    )
    total_transfers = total_result.scalar() or 0

    # Get 24h stats
    yesterday = datetime.utcnow() - timedelta(hours=24)
    stats_24h = await db.execute(
        select(func.count(), func.coalesce(func.sum(Transfer.amount), 0))
        .select_from(Transfer)
        .where(
            and_(
                Transfer.token_id == token_id,
                Transfer.block_time >= yesterday,
            )
        )
    )
    row = stats_24h.one()
    transfers_24h = row[0] or 0
    volume_24h = row[1] or 0

    return TransferStatsResponse(
        total_transfers=total_transfers,
        transfers_24h=transfers_24h,
        volume_24h=volume_24h,
    )


@router.get("/{token_id}/transfers/recent", response_model=list[TransferResponse])
async def get_recent_transfers(
    token_id: int,
    limit: int = Query(10, ge=1, le=50),
    max_slot: int = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get most recent transfers for a token (for dashboard).

    If max_slot is provided, only returns transfers with slot <= max_slot.
    """
    # Verify token exists
    result = await db.execute(select(Token).where(Token.token_id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Build query
    query = select(Transfer).where(Transfer.token_id == token_id)

    if max_slot is not None:
        query = query.where(Transfer.slot <= max_slot)

    query = query.order_by(Transfer.block_time.desc()).limit(limit)

    result = await db.execute(query)
    transfers = result.scalars().all()

    return [TransferResponse.model_validate(t) for t in transfers]
