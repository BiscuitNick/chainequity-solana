"""Vesting schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class VestingType(str, Enum):
    LINEAR = "linear"
    CLIFF_THEN_LINEAR = "cliff_then_linear"
    STEPPED = "stepped"


class TerminationType(str, Enum):
    STANDARD = "standard"
    FOR_CAUSE = "for_cause"
    ACCELERATED = "accelerated"


class VestingScheduleResponse(BaseModel):
    id: str
    beneficiary: str
    total_amount: int
    released_amount: int
    vested_amount: int
    start_time: datetime
    cliff_duration: int
    total_duration: int
    vesting_type: str
    revocable: bool
    is_terminated: bool
    termination_type: Optional[str] = None
    terminated_at: Optional[datetime] = None


class CreateVestingRequest(BaseModel):
    beneficiary: str
    total_amount: int
    start_time: int  # Unix timestamp
    cliff_seconds: int
    duration_seconds: int
    vesting_type: VestingType
    revocable: bool = False


class TerminateVestingRequest(BaseModel):
    termination_type: TerminationType
    notes: Optional[str] = None


class TerminationPreviewResponse(BaseModel):
    current_vested: int
    final_vested: int
    to_treasury: int
