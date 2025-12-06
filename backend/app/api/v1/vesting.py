"""Vesting API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.models.database import get_db
from app.models.vesting import VestingSchedule
from app.schemas.vesting import (
    VestingScheduleResponse,
    CreateVestingRequest,
    TerminateVestingRequest,
    TerminationPreviewResponse,
)

router = APIRouter()


@router.get("", response_model=List[VestingScheduleResponse])
async def list_vesting_schedules(token_id: int, db: AsyncSession = Depends(get_db)):
    """List all vesting schedules for a token"""
    result = await db.execute(
        select(VestingSchedule).where(VestingSchedule.token_id == token_id)
    )
    schedules = result.scalars().all()

    return [_schedule_to_response(s) for s in schedules]


@router.get("/{schedule_id}", response_model=VestingScheduleResponse)
async def get_vesting_schedule(token_id: int, schedule_id: str, db: AsyncSession = Depends(get_db)):
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
    token_id: int,
    address: str,
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
    token_id: int,
    request: CreateVestingRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new vesting schedule"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/{schedule_id}/release")
async def release_vested_tokens(
    token_id: int,
    schedule_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Release vested tokens"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/{schedule_id}/terminate")
async def terminate_vesting(
    token_id: int,
    schedule_id: str,
    request: TerminateVestingRequest,
    db: AsyncSession = Depends(get_db)
):
    """Terminate a vesting schedule"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.get("/{schedule_id}/termination-preview", response_model=TerminationPreviewResponse)
async def get_termination_preview(
    token_id: int,
    schedule_id: str,
    termination_type: str,
    db: AsyncSession = Depends(get_db)
):
    """Preview the result of terminating a vesting schedule"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


def _schedule_to_response(s: VestingSchedule) -> VestingScheduleResponse:
    from datetime import datetime
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
