"""Vesting API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.vesting import VestingSchedule
from app.models.token import Token
from app.models.snapshot import CurrentBalance
from app.models.share_class import ShareClass, SharePosition
from app.schemas.vesting import (
    VestingScheduleResponse,
    CreateVestingRequest,
    TerminateVestingRequest,
    TerminationPreviewResponse,
    TerminationType,
    ShareClassInfo,
)
from app.services.solana_client import get_solana_client
from app.services.transaction_service import TransactionService
from app.models.unified_transaction import TransactionType
from solders.pubkey import Pubkey

router = APIRouter()


async def _update_balance(db: AsyncSession, token_id: int, wallet: str, amount: int):
    """Update or create a balance record for a wallet"""
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == wallet
        )
    )
    balance = result.scalar_one_or_none()

    if balance:
        balance.balance += amount
        balance.last_updated_slot = 0
        balance.updated_at = datetime.utcnow()
    else:
        balance = CurrentBalance(
            token_id=token_id,
            wallet=wallet,
            balance=amount,
            last_updated_slot=0,
        )
        db.add(balance)


async def _auto_release_vested(db: AsyncSession, token_id: int, schedule: VestingSchedule):
    """Auto-release any newly vested tokens to the beneficiary's balance.

    Uses interval-based calculation: tokens only release at discrete intervals.
    Records a VESTING_RELEASE transaction to ensure consistency between
    the schedule's released_amount and the transaction log.
    """
    now = datetime.utcnow()

    # Use interval-based calculation (not continuous)
    new_intervals = schedule.calculate_releasable_intervals(now)
    if new_intervals <= 0:
        return  # No new intervals to release

    # Calculate release amount for these intervals
    total_intervals = schedule.total_intervals()
    amount_per = schedule.amount_per_interval()
    remainder = schedule.remainder()

    previous_intervals = schedule.intervals_released or 0
    new_total_intervals = previous_intervals + new_intervals

    # Base release for new intervals
    release_amount = amount_per * new_intervals

    # Add remainder shares for final intervals
    remainder_start = total_intervals - remainder
    if new_total_intervals > remainder_start and previous_intervals < total_intervals:
        remainder_intervals_before = max(0, previous_intervals - remainder_start) if previous_intervals > remainder_start else 0
        remainder_intervals_now = min(new_total_intervals - remainder_start, remainder) if new_total_intervals > remainder_start else 0
        release_amount += remainder_intervals_now - remainder_intervals_before

    if release_amount <= 0:
        return  # No tokens to release

    # Get current slot for transaction recording
    try:
        solana_client = await get_solana_client()
        current_slot = await solana_client.get_slot()
    except Exception:
        current_slot = 0

    # Record VESTING_RELEASE transaction (must happen BEFORE updating released_amount)
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.VESTING_RELEASE,
        slot=current_slot,
        wallet=schedule.beneficiary,
        amount=release_amount,
        share_class_id=schedule.share_class_id,
        priority=schedule.share_class.priority if schedule.share_class else 99,
        preference_multiple=schedule.share_class.preference_multiple if schedule.share_class else 1.0,
        price_per_share=schedule.price_per_share,
        reference_id=schedule.id,
        reference_type="vesting_schedule",
        triggered_by="api:auto_release",
        data={
            "intervals_released": new_intervals,
            "total_intervals_released": new_total_intervals,
            "total_intervals": total_intervals,
            "amount_per_interval": amount_per,
            "total_amount": schedule.total_amount,
            "schedule_address": schedule.on_chain_address,
        },
    )

    # Update schedule state
    schedule.intervals_released = new_total_intervals
    schedule.released_amount += release_amount

    # Credit to beneficiary's cap table balance
    await _update_balance(db, token_id, schedule.beneficiary, release_amount)

    # Also update SharePosition if share class is set
    if schedule.share_class_id:
        result = await db.execute(
            select(SharePosition).where(
                SharePosition.token_id == token_id,
                SharePosition.wallet == schedule.beneficiary,
                SharePosition.share_class_id == schedule.share_class_id
            )
        )
        position = result.scalar_one_or_none()
        if position:
            position.shares += release_amount
            position.updated_at = datetime.utcnow()


@router.get("", response_model=List[VestingScheduleResponse])
async def list_vesting_schedules(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """List all vesting schedules for a token - auto-releases vested tokens"""
    result = await db.execute(
        select(VestingSchedule)
        .options(selectinload(VestingSchedule.share_class))
        .where(VestingSchedule.token_id == token_id)
    )
    schedules = result.scalars().all()

    # Auto-release vested tokens for active schedules
    for schedule in schedules:
        if not schedule.is_terminated:
            await _auto_release_vested(db, token_id, schedule)

    await db.commit()

    return [_schedule_to_response(s) for s in schedules]


@router.get("/{schedule_id}", response_model=VestingScheduleResponse)
async def get_vesting_schedule(token_id: int = Path(...), schedule_id: str = Path(...), db: AsyncSession = Depends(get_db)):
    """Get a specific vesting schedule - auto-releases vested tokens"""
    result = await db.execute(
        select(VestingSchedule)
        .options(selectinload(VestingSchedule.share_class))
        .where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.on_chain_address == schedule_id
        )
    )
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Vesting schedule not found")

    # Auto-release vested tokens
    if not schedule.is_terminated:
        await _auto_release_vested(db, token_id, schedule)
        await db.commit()

    return _schedule_to_response(schedule)


@router.get("/wallet/{address}", response_model=List[VestingScheduleResponse])
async def get_wallet_vesting_schedules(
    token_id: int = Path(...),
    address: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get all vesting schedules for a wallet"""
    result = await db.execute(
        select(VestingSchedule)
        .options(selectinload(VestingSchedule.share_class))
        .where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.beneficiary == address
        )
    )
    schedules = result.scalars().all()

    return [_schedule_to_response(s) for s in schedules]


@router.post("")
async def create_vesting_schedule(
    request: CreateVestingRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new vesting schedule.

    All vesting is interval-based: tokens release at fixed intervals
    (minute/hour/day/month) with equal amounts per interval.

    Vesting shares are always common stock with no liquidation preference.
    """
    # Get token
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Check vesting is enabled
    if not token.features.get("vesting_enabled", False):
        raise HTTPException(status_code=400, detail="Vesting not enabled for this token")

    # Validate beneficiary address
    try:
        beneficiary_pubkey = Pubkey.from_string(request.beneficiary)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid beneficiary address format")

    # Validate amounts and durations
    if request.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be positive")
    if request.duration_seconds <= 0:
        raise HTTPException(status_code=400, detail="Duration must be positive")
    if request.cliff_seconds < 0:
        raise HTTPException(status_code=400, detail="Cliff duration cannot be negative")
    if request.cliff_seconds >= request.duration_seconds:
        raise HTTPException(status_code=400, detail="Cliff must be less than total duration")

    # Validate interval - vesting duration must be at least one interval
    interval_seconds = {
        "minute": 60,
        "hour": 3600,
        "day": 86400,
        "month": 30 * 86400,
    }.get(request.interval.value, 60)
    vesting_duration = request.duration_seconds - request.cliff_seconds
    if vesting_duration < interval_seconds:
        raise HTTPException(
            status_code=400,
            detail=f"Vesting duration after cliff must be at least one {request.interval.value}"
        )

    # Build transaction data
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    vesting_pda, _ = solana_client.derive_vesting_pda(token_config_pda, beneficiary_pubkey, request.start_time)

    # Create vesting schedule record in database
    # Note: In production, this should be created after on-chain tx confirms via event listener
    schedule = VestingSchedule(
        token_id=token_id,
        share_class_id=None,  # Vesting shares are always common - no preference
        on_chain_address=str(vesting_pda),
        beneficiary=request.beneficiary,
        total_amount=request.total_amount,
        released_amount=0,
        cost_basis=request.cost_basis,
        price_per_share=request.price_per_share,
        start_time=datetime.utcfromtimestamp(request.start_time),
        cliff_seconds=request.cliff_seconds,
        duration_seconds=request.duration_seconds,
        interval=request.interval.value,
        intervals_released=0,
        vesting_type=None,  # Deprecated
        revocable=request.revocable,
    )
    db.add(schedule)
    await db.flush()  # Get schedule.id

    # Get current slot for transaction recording
    try:
        current_slot = await solana_client.get_slot()
    except Exception:
        current_slot = 0

    # Calculate interval info
    total_intervals = schedule.total_intervals()
    amount_per_interval = schedule.amount_per_interval()

    # Record VESTING_SCHEDULE_CREATE transaction
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.VESTING_SCHEDULE_CREATE,
        slot=current_slot,
        wallet=request.beneficiary,
        amount=request.total_amount,
        amount_secondary=request.cost_basis,
        share_class_id=None,  # Vesting is always common
        priority=99,  # Common stock priority
        preference_multiple=1.0,  # No preference
        price_per_share=request.price_per_share,
        reference_id=schedule.id,
        reference_type="vesting_schedule",
        triggered_by="api:create_vesting_schedule",
        data={
            "start_time": request.start_time,
            "duration_seconds": request.duration_seconds,
            "cliff_seconds": request.cliff_seconds,
            "interval": request.interval.value,
            "total_intervals": total_intervals,
            "amount_per_interval": amount_per_interval,
            "revocable": request.revocable,
            "on_chain_address": str(vesting_pda),
        },
    )

    await db.commit()
    await db.refresh(schedule)

    return {
        "message": f"Successfully created vesting schedule for {request.total_amount} tokens",
        "schedule_id": schedule.on_chain_address,
        "vesting_pda": str(vesting_pda),
        "total_intervals": total_intervals,
        "amount_per_interval": amount_per_interval,
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "create_vesting_schedule",
            "data": {
                "beneficiary": request.beneficiary,
                "total_amount": request.total_amount,
                "start_time": request.start_time,
                "cliff_duration": request.cliff_seconds,
                "total_duration": request.duration_seconds,
                "interval": request.interval.value,
                "revocable": request.revocable,
            }
        }
    }


@router.post("/{schedule_id}/release")
async def release_vested_tokens(
    token_id: int = Path(...),
    schedule_id: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Release vested tokens.

    Releases any newly vested intervals. Each interval releases a fixed amount.
    """
    # Get schedule
    result = await db.execute(
        select(VestingSchedule).where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.on_chain_address == schedule_id
        )
    )
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Vesting schedule not found")

    if schedule.is_terminated:
        raise HTTPException(status_code=400, detail="Vesting schedule has been terminated")

    # Calculate releasable intervals
    now = datetime.utcnow()
    new_intervals = schedule.calculate_releasable_intervals(now)

    if new_intervals <= 0:
        raise HTTPException(status_code=400, detail="No tokens available for release")

    # Calculate release amount for these intervals
    total_intervals = schedule.total_intervals()
    amount_per = schedule.amount_per_interval()
    remainder = schedule.remainder()

    previous_intervals = schedule.intervals_released
    new_total_intervals = previous_intervals + new_intervals

    # Base release for new intervals
    release_amount = amount_per * new_intervals

    # Add remainder shares for final intervals
    remainder_start = total_intervals - remainder
    if new_total_intervals > remainder_start and previous_intervals < total_intervals:
        remainder_intervals_before = max(0, previous_intervals - remainder_start) if previous_intervals > remainder_start else 0
        remainder_intervals_now = min(new_total_intervals - remainder_start, remainder) if new_total_intervals > remainder_start else 0
        release_amount += remainder_intervals_now - remainder_intervals_before

    if release_amount <= 0:
        raise HTTPException(status_code=400, detail="No tokens available for release")

    # Get current slot for transaction recording
    solana_client = await get_solana_client()
    try:
        current_slot = await solana_client.get_slot()
    except Exception:
        current_slot = 0

    # Record VESTING_RELEASE transaction (must happen BEFORE updating released_amount)
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.VESTING_RELEASE,
        slot=current_slot,
        wallet=schedule.beneficiary,
        amount=release_amount,
        share_class_id=schedule.share_class_id,
        priority=schedule.share_class.priority if schedule.share_class else 99,
        preference_multiple=schedule.share_class.preference_multiple if schedule.share_class else 1.0,
        price_per_share=schedule.price_per_share,
        reference_id=schedule.id,
        reference_type="vesting_schedule",
        triggered_by="api:release_vested_tokens",
        data={
            "intervals_released": new_intervals,
            "total_intervals_released": new_total_intervals,
            "total_intervals": total_intervals,
            "amount_per_interval": amount_per,
            "total_amount": schedule.total_amount,
            "schedule_address": schedule.on_chain_address,
        },
    )

    # Update schedule state
    schedule.intervals_released = new_total_intervals
    schedule.released_amount += release_amount

    # Update beneficiary's balance in cap table
    await _update_balance(db, token_id, schedule.beneficiary, release_amount)

    await db.commit()
    await db.refresh(schedule)

    return {
        "message": f"Successfully released {release_amount} tokens ({new_intervals} intervals)",
        "vesting_pda": schedule_id,
        "released_amount": release_amount,
        "intervals_released": new_intervals,
        "total_released": schedule.released_amount,
        "total_intervals_released": schedule.intervals_released,
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "release_vested_tokens",
            "data": {
                "schedule_id": schedule_id,
            }
        }
    }


@router.post("/{schedule_id}/terminate")
async def terminate_vesting(
    request: TerminateVestingRequest,
    token_id: int = Path(...),
    schedule_id: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Terminate a vesting schedule - updates DB immediately for demo/testing"""
    # Get schedule
    result = await db.execute(
        select(VestingSchedule).where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.on_chain_address == schedule_id
        )
    )
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Vesting schedule not found")

    if schedule.is_terminated:
        raise HTTPException(status_code=400, detail="Vesting schedule already terminated")

    if not schedule.revocable:
        raise HTTPException(status_code=400, detail="Vesting schedule is not revocable")

    # Calculate preview
    preview = _calculate_termination_preview(schedule, request.termination_type)

    # Calculate how much newly vests due to termination (for accelerated, this is the difference)
    previously_released = schedule.released_amount
    newly_vested = preview.final_vested - previously_released

    # Update schedule in database (for demo/testing)
    # In production, this would be updated after on-chain tx confirms
    schedule.termination_type = request.termination_type.value
    schedule.terminated_at = datetime.utcnow()
    schedule.vested_at_termination = preview.final_vested
    schedule.released_amount = preview.final_vested  # Mark all vested tokens as released
    schedule.termination_notes = request.notes
    schedule.revoked = True

    # Update beneficiary's balance if they gain tokens from termination (accelerated)
    if newly_vested > 0:
        await _update_balance(db, token_id, schedule.beneficiary, newly_vested)

    # Get current slot and record termination transaction
    solana_client = await get_solana_client()
    try:
        current_slot = await solana_client.get_slot()
    except Exception:
        current_slot = 0

    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.VESTING_TERMINATE,
        slot=current_slot,
        wallet=schedule.beneficiary,
        amount=preview.final_vested,
        amount_secondary=preview.to_treasury,
        share_class_id=schedule.share_class_id,
        reference_id=schedule.id,
        reference_type="vesting_schedule",
        triggered_by="api:terminate_vesting",
        data={
            "termination_type": request.termination_type.value,
            "current_vested": preview.current_vested,
            "final_vested": preview.final_vested,
            "to_treasury": preview.to_treasury,
            "notes": request.notes,
        },
    )

    await db.commit()
    await db.refresh(schedule)

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()

    return {
        "message": f"Successfully terminated vesting schedule ({request.termination_type.value})",
        "vesting_pda": schedule_id,
        "preview": {
            "current_vested": preview.current_vested,
            "final_vested": preview.final_vested,
            "to_treasury": preview.to_treasury,
        },
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "terminate_vesting",
            "data": {
                "schedule_id": schedule_id,
                "termination_type": request.termination_type.value,
            }
        }
    }


@router.get("/{schedule_id}/termination-preview", response_model=TerminationPreviewResponse)
async def get_termination_preview(
    termination_type: str,
    token_id: int = Path(...),
    schedule_id: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Preview the result of terminating a vesting schedule"""
    # Get schedule
    result = await db.execute(
        select(VestingSchedule).where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.on_chain_address == schedule_id
        )
    )
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Vesting schedule not found")

    if schedule.is_terminated:
        raise HTTPException(status_code=400, detail="Vesting schedule already terminated")

    # Validate termination type
    try:
        term_type = TerminationType(termination_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid termination type: {termination_type}")

    return _calculate_termination_preview(schedule, term_type)


def _calculate_termination_preview(
    schedule: VestingSchedule,
    termination_type: TerminationType
) -> TerminationPreviewResponse:
    """Calculate what happens when a vesting schedule is terminated"""
    now = datetime.utcnow()
    current_vested = schedule.calculate_vested(now)

    if termination_type == TerminationType.ACCELERATED:
        # Full vesting on acceleration
        final_vested = schedule.total_amount
    elif termination_type == TerminationType.FOR_CAUSE:
        # Forfeit all unvested tokens
        final_vested = current_vested
    else:  # STANDARD
        # Standard termination - keep what's vested
        final_vested = current_vested

    to_treasury = schedule.total_amount - final_vested

    return TerminationPreviewResponse(
        current_vested=current_vested,
        final_vested=final_vested,
        to_treasury=to_treasury,
    )


def _schedule_to_response(s: VestingSchedule) -> VestingScheduleResponse:
    vested = s.calculate_vested(datetime.utcnow())

    # Vesting shares are always common - no preference
    # Share class info kept for backward compatibility but preference_amount is 0
    share_class_info = None
    if s.share_class:
        share_class_info = ShareClassInfo(
            id=s.share_class.id,
            name=s.share_class.name,
            symbol=s.share_class.symbol,
            priority=s.share_class.priority,
            preference_multiple=s.share_class.preference_multiple,
        )

    return VestingScheduleResponse(
        id=s.on_chain_address,
        beneficiary=s.beneficiary,
        total_amount=s.total_amount,
        released_amount=s.released_amount,
        vested_amount=vested,
        start_time=s.start_time,
        cliff_duration=s.cliff_seconds,
        total_duration=s.duration_seconds,
        # New interval-based fields
        interval=s.interval or "minute",
        total_intervals=s.total_intervals(),
        intervals_released=s.intervals_released or 0,
        amount_per_interval=s.amount_per_interval(),
        # Deprecated - kept for backward compatibility
        vesting_type=s.vesting_type,
        revocable=s.revocable,
        is_terminated=s.is_terminated,
        termination_type=s.termination_type,
        terminated_at=s.terminated_at,
        share_class_id=s.share_class_id,
        share_class=share_class_info,
        cost_basis=s.cost_basis,
        price_per_share=s.price_per_share,
        preference_amount=0,  # Always 0 for vesting (common stock)
    )
