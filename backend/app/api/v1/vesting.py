"""Vesting API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.vesting import VestingSchedule
from app.models.token import Token
from app.schemas.vesting import (
    VestingScheduleResponse,
    CreateVestingRequest,
    TerminateVestingRequest,
    TerminationPreviewResponse,
    TerminationType,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


@router.get("", response_model=List[VestingScheduleResponse])
async def list_vesting_schedules(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """List all vesting schedules for a token"""
    result = await db.execute(
        select(VestingSchedule).where(VestingSchedule.token_id == token_id)
    )
    schedules = result.scalars().all()

    return [_schedule_to_response(s) for s in schedules]


@router.get("/{schedule_id}", response_model=VestingScheduleResponse)
async def get_vesting_schedule(token_id: int = Path(...), schedule_id: str = Path(...), db: AsyncSession = Depends(get_db)):
    """Get a specific vesting schedule"""
    result = await db.execute(
        select(VestingSchedule).where(
            VestingSchedule.token_id == token_id,
            VestingSchedule.on_chain_address == schedule_id
        )
    )
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(status_code=404, detail="Vesting schedule not found")

    return _schedule_to_response(schedule)


@router.get("/wallet/{address}", response_model=List[VestingScheduleResponse])
async def get_wallet_vesting_schedules(
    token_id: int = Path(...),
    address: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get all vesting schedules for a wallet"""
    result = await db.execute(
        select(VestingSchedule).where(
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
    """Create a new vesting schedule - returns unsigned transaction for client signing"""
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
    if request.cliff_seconds > request.duration_seconds:
        raise HTTPException(status_code=400, detail="Cliff cannot exceed total duration")

    # Build transaction data
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    vesting_pda, _ = solana_client.derive_vesting_pda(token_config_pda, beneficiary_pubkey, request.start_time)

    return {
        "message": "Vesting schedule creation transaction prepared for signing",
        "vesting_pda": str(vesting_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.token),
            "action": "create_vesting_schedule",
            "data": {
                "beneficiary": request.beneficiary,
                "total_amount": request.total_amount,
                "start_time": request.start_time,
                "cliff_seconds": request.cliff_seconds,
                "duration_seconds": request.duration_seconds,
                "vesting_type": request.vesting_type.value,
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
    """Release vested tokens - returns unsigned transaction for client signing"""
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

    # Calculate releasable amount
    now = datetime.utcnow()
    vested = schedule.calculate_vested(now)
    releasable = vested - schedule.released_amount

    if releasable <= 0:
        raise HTTPException(status_code=400, detail="No tokens available for release")

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()

    solana_client = await get_solana_client()

    return {
        "message": "Release vested tokens transaction prepared for signing",
        "vesting_pda": schedule_id,
        "releasable_amount": releasable,
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
    """Terminate a vesting schedule - returns unsigned transaction for client signing"""
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

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()

    # Calculate preview
    preview = _calculate_termination_preview(schedule, request.termination_type)

    solana_client = await get_solana_client()

    return {
        "message": "Terminate vesting transaction prepared for signing",
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
    return VestingScheduleResponse(
        id=s.on_chain_address,
        beneficiary=s.beneficiary,
        total_amount=s.total_amount,
        released_amount=s.released_amount,
        vested_amount=vested,
        start_time=s.start_time,
        cliff_duration=s.cliff_seconds,
        total_duration=s.duration_seconds,
        vesting_type=s.vesting_type,
        revocable=s.revocable,
        is_terminated=s.is_terminated,
        termination_type=s.termination_type,
        terminated_at=s.terminated_at,
    )
