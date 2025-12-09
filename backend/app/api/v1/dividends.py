"""Dividends API endpoints - Auto-distribution model"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import List
from datetime import datetime
import math
import asyncio

from app.models.database import get_db
from app.models.dividend import DividendRound, DividendPayment
from app.models.token import Token
from app.models.snapshot import CurrentBalance
from app.schemas.dividend import (
    DividendRoundResponse,
    CreateDividendRequest,
    DividendPaymentResponse,
    DistributionProgressResponse,
)
from solders.pubkey import Pubkey
from app.services.history import HistoryService
from app.services.solana_client import get_solana_client
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Configuration
BATCH_SIZE = 25  # Number of transfers per transaction (safe limit for Solana compute)


def _round_to_response(r: DividendRound, total_distributed: int = 0, distribution_count: int = 0) -> DividendRoundResponse:
    """Convert DividendRound model to response schema"""
    return DividendRoundResponse(
        id=r.id,
        round_number=r.round_number,
        payment_token=r.payment_token,
        total_pool=r.total_pool,
        amount_per_share=r.amount_per_share,
        snapshot_slot=r.snapshot_slot,
        status=r.status,
        created_at=r.created_at,
        distributed_at=r.distributed_at,
        total_recipients=r.total_recipients,
        total_batches=r.total_batches,
        completed_batches=r.completed_batches,
        total_distributed=total_distributed,
        distribution_count=distribution_count,
    )


@router.get("", response_model=List[DividendRoundResponse])
async def list_dividend_rounds(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """List all dividend rounds"""
    result = await db.execute(
        select(DividendRound)
        .where(DividendRound.token_id == token_id)
        .order_by(DividendRound.round_number.desc())
    )
    rounds = result.scalars().all()

    responses = []
    for r in rounds:
        # Get distribution statistics
        dist_result = await db.execute(
            select(
                func.sum(DividendPayment.amount).label('total_distributed'),
                func.count(DividendPayment.id).label('distribution_count')
            ).where(
                DividendPayment.round_id == r.id,
                DividendPayment.status == 'sent'
            )
        )
        dist_stats = dist_result.first()
        total_distributed = dist_stats.total_distributed or 0
        distribution_count = dist_stats.distribution_count or 0

        responses.append(_round_to_response(r, total_distributed, distribution_count))

    return responses


@router.get("/{round_id}", response_model=DividendRoundResponse)
async def get_dividend_round(token_id: int = Path(...), round_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Get a specific dividend round"""
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()

    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    # Get distribution statistics
    dist_result = await db.execute(
        select(
            func.sum(DividendPayment.amount).label('total_distributed'),
            func.count(DividendPayment.id).label('distribution_count')
        ).where(
            DividendPayment.round_id == round_obj.id,
            DividendPayment.status == 'sent'
        )
    )
    dist_stats = dist_result.first()
    total_distributed = dist_stats.total_distributed or 0
    distribution_count = dist_stats.distribution_count or 0

    return _round_to_response(round_obj, total_distributed, distribution_count)


@router.get("/{round_id}/progress", response_model=DistributionProgressResponse)
async def get_distribution_progress(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed distribution progress for a round"""
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    # Get payment statistics by status
    stats_result = await db.execute(
        select(
            DividendPayment.status,
            func.count(DividendPayment.id).label('count'),
            func.sum(DividendPayment.amount).label('total')
        ).where(DividendPayment.round_id == round_id)
        .group_by(DividendPayment.status)
    )
    stats = {row.status: {'count': row.count, 'total': row.total or 0} for row in stats_result}

    return DistributionProgressResponse(
        round_id=round_id,
        status=round_obj.status,
        total_recipients=round_obj.total_recipients,
        total_batches=round_obj.total_batches,
        completed_batches=round_obj.completed_batches,
        successful_payments=stats.get('sent', {}).get('count', 0),
        failed_payments=stats.get('failed', {}).get('count', 0),
        pending_payments=stats.get('pending', {}).get('count', 0),
        total_distributed=stats.get('sent', {}).get('total', 0),
        total_pool=round_obj.total_pool,
    )


@router.post("", response_model=DividendRoundResponse)
async def create_dividend_round(
    request: CreateDividendRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new dividend round and automatically distribute to all shareholders"""
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Check dividends are enabled
    if not token.features.get("dividends_enabled", False):
        raise HTTPException(status_code=400, detail="Dividends not enabled for this token")

    # Validate payment token address
    try:
        Pubkey.from_string(request.payment_token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payment token address format")

    if request.total_pool <= 0:
        raise HTTPException(status_code=400, detail="Total pool must be positive")

    # Get next round number
    result = await db.execute(
        select(func.max(DividendRound.round_number)).where(DividendRound.token_id == token_id)
    )
    max_num = result.scalar() or 0
    next_num = max_num + 1

    # Get all shareholders and their balances (snapshot)
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.balance > 0
        )
    )
    shareholders = result.scalars().all()

    if not shareholders:
        raise HTTPException(status_code=400, detail="No shareholders found - cannot create dividend distribution")

    # Calculate total minted supply
    minted_supply = sum(s.balance for s in shareholders)

    if minted_supply <= 0:
        raise HTTPException(status_code=400, detail="No minted shares found - cannot create dividend distribution")

    # Calculate amount per share
    amount_per_share = request.total_pool / minted_supply

    # Calculate batches needed
    total_recipients = len(shareholders)
    total_batches = math.ceil(total_recipients / BATCH_SIZE)

    # Create the dividend round
    new_round = DividendRound(
        token_id=token_id,
        round_number=next_num,
        payment_token=request.payment_token,
        total_pool=request.total_pool,
        amount_per_share=amount_per_share,
        snapshot_slot=0,  # Could be set to current slot for on-chain reference
        status="distributing",
        total_recipients=total_recipients,
        total_batches=total_batches,
        completed_batches=0,
    )
    db.add(new_round)
    await db.flush()  # Get the round ID

    # Create payment records for each shareholder
    for i, shareholder in enumerate(shareholders):
        payment_amount = int(shareholder.balance * amount_per_share)
        batch_num = i // BATCH_SIZE

        payment = DividendPayment(
            token_id=token_id,
            round_id=new_round.id,
            wallet=shareholder.wallet,
            shares=shareholder.balance,
            amount=payment_amount,
            status="pending",
            batch_number=batch_num,
        )
        db.add(payment)

    await db.commit()
    await db.refresh(new_round)

    # Auto-create snapshot after dividend round creation
    try:
        solana_client = await get_solana_client()
        current_slot = await solana_client.get_slot()
        history_service = HistoryService(db)
        await history_service.create_snapshot(
            token_id=token_id,
            trigger=f"dividend_round:{new_round.id}",
            slot=current_slot,
        )
        await db.commit()
    except Exception as e:
        logger.warning("Failed to create auto-snapshot after dividend creation", error=str(e))

    # Process distributions in background using asyncio.create_task
    asyncio.create_task(process_distributions(new_round.id, token_id))

    return _round_to_response(new_round, total_distributed=0, distribution_count=0)


async def process_distributions(round_id: int, token_id: int):
    """Background task to process dividend distributions in batches"""
    from app.models.database import async_session_factory

    async with async_session_factory() as db:
        try:
            # Get the round
            result = await db.execute(
                select(DividendRound).where(DividendRound.id == round_id)
            )
            round_obj = result.scalar_one_or_none()
            if not round_obj:
                return

            # Process each batch
            for batch_num in range(round_obj.total_batches):
                # Get pending payments for this batch
                result = await db.execute(
                    select(DividendPayment).where(
                        DividendPayment.round_id == round_id,
                        DividendPayment.batch_number == batch_num,
                        DividendPayment.status == "pending"
                    )
                )
                payments = result.scalars().all()

                # Process this batch (in production, this would be actual SPL token transfers)
                # For demo, we'll mark them as sent immediately
                for payment in payments:
                    try:
                        # In production: Execute actual SPL token transfer here
                        # signature = await transfer_spl_token(payment.wallet, payment.amount, round_obj.payment_token)

                        # For demo, simulate successful transfer
                        payment.status = "sent"
                        payment.distributed_at = datetime.utcnow()
                        payment.signature = f"demo_sig_{round_id}_{payment.id}"

                    except Exception as e:
                        payment.status = "failed"
                        payment.error_message = str(e)[:500]

                # Update batch progress
                round_obj.completed_batches = batch_num + 1
                await db.commit()

            # Mark round as completed
            round_obj.status = "completed"
            round_obj.distributed_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            # Mark round as failed if something goes wrong
            try:
                result = await db.execute(
                    select(DividendRound).where(DividendRound.id == round_id)
                )
                round_obj = result.scalar_one_or_none()
                if round_obj:
                    round_obj.status = "failed"
                    await db.commit()
            except:
                pass


@router.post("/{round_id}/retry")
async def retry_failed_distributions(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Retry failed distributions for a round"""
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    # Count failed payments
    result = await db.execute(
        select(func.count(DividendPayment.id)).where(
            DividendPayment.round_id == round_id,
            DividendPayment.status == "failed"
        )
    )
    failed_count = result.scalar() or 0

    if failed_count == 0:
        raise HTTPException(status_code=400, detail="No failed payments to retry")

    # Reset failed payments to pending
    await db.execute(
        update(DividendPayment)
        .where(
            DividendPayment.round_id == round_id,
            DividendPayment.status == "failed"
        )
        .values(status="pending", error_message=None)
    )

    # Update round status
    round_obj.status = "distributing"
    await db.commit()

    # Process retries in background
    asyncio.create_task(retry_distributions(round_id))

    return {"message": f"Retrying {failed_count} failed distributions", "count": failed_count}


async def retry_distributions(round_id: int):
    """Background task to retry failed distributions"""
    from app.models.database import async_session_factory

    async with async_session_factory() as db:
        try:
            result = await db.execute(
                select(DividendPayment).where(
                    DividendPayment.round_id == round_id,
                    DividendPayment.status == "pending"
                )
            )
            payments = result.scalars().all()

            for payment in payments:
                try:
                    # In production: Execute actual SPL token transfer
                    payment.status = "sent"
                    payment.distributed_at = datetime.utcnow()
                    payment.signature = f"retry_sig_{round_id}_{payment.id}"
                except Exception as e:
                    payment.status = "failed"
                    payment.error_message = str(e)[:500]

            await db.commit()

            # Check if all payments are now sent
            result = await db.execute(
                select(func.count(DividendPayment.id)).where(
                    DividendPayment.round_id == round_id,
                    DividendPayment.status == "pending"
                )
            )
            pending_count = result.scalar() or 0

            result = await db.execute(
                select(DividendRound).where(DividendRound.id == round_id)
            )
            round_obj = result.scalar_one_or_none()
            if round_obj and pending_count == 0:
                # Check for any failed
                result = await db.execute(
                    select(func.count(DividendPayment.id)).where(
                        DividendPayment.round_id == round_id,
                        DividendPayment.status == "failed"
                    )
                )
                failed_count = result.scalar() or 0

                if failed_count == 0:
                    round_obj.status = "completed"
                    round_obj.distributed_at = datetime.utcnow()
                else:
                    round_obj.status = "completed"  # Still completed but with failures
                await db.commit()

        except Exception:
            pass


@router.get("/{round_id}/payments", response_model=List[DividendPaymentResponse])
async def get_round_payments(
    token_id: int = Path(...),
    round_id: int = Path(...),
    status: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all payments for a dividend round"""
    # Verify round exists
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    # Build query
    query = select(DividendPayment).where(DividendPayment.round_id == round_id)
    if status:
        query = query.where(DividendPayment.status == status)
    query = query.order_by(DividendPayment.id)

    result = await db.execute(query)
    payments = result.scalars().all()

    return [
        DividendPaymentResponse(
            id=p.id,
            round_id=p.round_id,
            wallet=p.wallet,
            shares=p.shares,
            amount=p.amount,
            status=p.status,
            batch_number=p.batch_number,
            created_at=p.created_at,
            distributed_at=p.distributed_at,
            signature=p.signature,
            error_message=p.error_message,
            dividend_per_share=round_obj.amount_per_share,
        )
        for p in payments
    ]


# Legacy endpoint for backwards compatibility with frontend
@router.get("/{round_id}/claims")
async def get_round_claims(
    token_id: int = Path(...),
    round_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get all payments for a dividend round (legacy endpoint)"""
    result = await db.execute(
        select(DividendRound).where(
            DividendRound.token_id == token_id,
            DividendRound.id == round_id
        )
    )
    round_obj = result.scalar_one_or_none()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Dividend round not found")

    result = await db.execute(
        select(DividendPayment).where(DividendPayment.round_id == round_id)
        .order_by(DividendPayment.distributed_at.desc())
    )
    payments = result.scalars().all()

    # Return in legacy format for frontend compatibility
    return [
        {
            "id": p.id,
            "wallet": p.wallet,
            "shares": p.shares,
            "dividend_per_share": round_obj.amount_per_share,
            "amount": p.amount,
            "claimed_at": p.distributed_at or p.created_at,
            "signature": p.signature,
            "status": p.status,
        }
        for p in payments
    ]
