"""Vesting schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class VestingInterval(str, Enum):
    """Vesting interval - how often tokens are released"""
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    MONTH = "month"


class TerminationType(str, Enum):
    STANDARD = "standard"
    FOR_CAUSE = "for_cause"
    ACCELERATED = "accelerated"


# Deprecated - kept for backward compatibility
class VestingType(str, Enum):
    LINEAR = "linear"
    CLIFF_THEN_LINEAR = "cliff_then_linear"
    STEPPED = "stepped"


class ShareClassInfo(BaseModel):
    """Share class info for vesting response"""
    id: int
    name: str
    symbol: str
    priority: int
    preference_multiple: float


class VestingScheduleResponse(BaseModel):
    id: str
    beneficiary: str
    total_amount: int
    released_amount: int
    vested_amount: int
    start_time: datetime
    cliff_duration: int
    total_duration: int
    # New interval-based fields
    interval: str = "minute"  # minute/hour/day/month
    total_intervals: int = 0
    intervals_released: int = 0
    amount_per_interval: int = 0
    # Deprecated - kept for backward compatibility
    vesting_type: Optional[str] = None
    revocable: bool
    is_terminated: bool
    termination_type: Optional[str] = None
    terminated_at: Optional[datetime] = None
    # Vesting shares are always common - no preference
    share_class_id: Optional[int] = None
    share_class: Optional[ShareClassInfo] = None
    cost_basis: int = 0  # In cents
    price_per_share: float = 0  # In cents (float for precision)
    preference_amount: int = 0  # Always 0 for vesting (common stock)


class CreateVestingRequest(BaseModel):
    """Create a new vesting schedule.

    All vesting is interval-based: tokens release at fixed intervals
    (minute/hour/day/month) with equal amounts per interval.

    Vesting shares are always common stock with no liquidation preference.
    """
    beneficiary: str
    total_amount: int
    start_time: int  # Unix timestamp
    cliff_seconds: int = 0
    duration_seconds: int
    # New: interval-based vesting
    interval: VestingInterval = VestingInterval.MINUTE
    revocable: bool = False
    # Cost basis tracking (optional)
    cost_basis: int = 0  # In cents - what was paid for these shares (0 for grants)
    price_per_share: float = 0  # In cents - price at grant time (float for precision)


class TerminateVestingRequest(BaseModel):
    termination_type: TerminationType
    notes: Optional[str] = None


class TerminationPreviewResponse(BaseModel):
    current_vested: int
    final_vested: int
    to_treasury: int
