"""Vesting schedule models"""
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.models.database import Base


class VestingStatus(str, Enum):
    """Vesting schedule status"""
    ACTIVE = "active"
    COMPLETED = "completed"
    TERMINATED_STANDARD = "terminated_standard"
    TERMINATED_FOR_CAUSE = "terminated_for_cause"
    TERMINATED_ACCELERATED = "terminated_accelerated"


class VestingInterval(str, Enum):
    """Vesting interval - how often tokens are released"""
    MINUTE = "minute"  # 60 seconds
    HOUR = "hour"      # 3600 seconds
    DAY = "day"        # 86400 seconds
    MONTH = "month"    # 30 * 86400 seconds

    def to_seconds(self) -> int:
        """Get interval duration in seconds"""
        intervals = {
            VestingInterval.MINUTE: 60,
            VestingInterval.HOUR: 3600,
            VestingInterval.DAY: 86400,
            VestingInterval.MONTH: 30 * 86400,
        }
        return intervals[self]


class VestingSchedule(Base):
    """Vesting schedule for a beneficiary.

    All vesting is discrete interval-based: tokens release at fixed intervals
    (minute/hour/day/month) with equal amounts per interval.

    Vesting shares are always common stock with no preference.
    """
    __tablename__ = "vesting_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    # Vesting shares are always common - no preference. share_class_id kept for DB compat
    share_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=True, index=True)
    on_chain_address = Column(String(44), nullable=False, unique=True)
    beneficiary = Column(String(44), nullable=False, index=True)
    total_amount = Column(BigInteger, nullable=False)
    released_amount = Column(BigInteger, nullable=False, default=0)
    cost_basis = Column(BigInteger, nullable=False, default=0)  # In cents - what was paid for these shares
    price_per_share = Column(BigInteger, nullable=False, default=0)  # In cents - price at grant time
    start_time = Column(DateTime, nullable=False)
    cliff_seconds = Column(BigInteger, nullable=False, default=0)
    duration_seconds = Column(BigInteger, nullable=False)
    # New: interval-based vesting (minute/hour/day/month)
    interval = Column(String(10), nullable=False, default="minute")
    intervals_released = Column(BigInteger, nullable=False, default=0)
    # Deprecated: vesting_type kept for backward compatibility
    vesting_type = Column(String(20), nullable=True)
    revocable = Column(Boolean, default=False)
    revoked = Column(Boolean, default=False)

    # Termination fields (simplified 3 types)
    termination_type = Column(String(20), nullable=True)  # standard, for_cause, accelerated
    terminated_at = Column(DateTime, nullable=True)
    terminated_by = Column(String(44), nullable=True)
    vested_at_termination = Column(BigInteger, nullable=True)
    termination_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="vesting_schedules")
    share_class = relationship("ShareClass", backref="vesting_schedules")

    @property
    def is_terminated(self) -> bool:
        return self.termination_type is not None

    @property
    def interval_seconds(self) -> int:
        """Get interval duration in seconds"""
        try:
            return VestingInterval(self.interval).to_seconds()
        except ValueError:
            return 60  # Default to minute if invalid

    def total_intervals(self) -> int:
        """Calculate total number of vesting intervals (after cliff)"""
        vesting_duration = self.duration_seconds - self.cliff_seconds
        if vesting_duration <= 0:
            return 1
        return max(1, vesting_duration // self.interval_seconds)

    def amount_per_interval(self) -> int:
        """Calculate amount per interval (equal distribution)"""
        total = self.total_intervals()
        if total == 0:
            return self.total_amount
        return self.total_amount // total

    def remainder(self) -> int:
        """Calculate remainder to add to final intervals"""
        total = self.total_intervals()
        if total == 0:
            return 0
        return self.total_amount % total

    def calculate_vested(self, current_time: datetime) -> int:
        """Calculate vested amount at a given time using discrete intervals.

        All vesting uses discrete intervals (minute/hour/day/month).
        Each interval releases the same amount: total_amount / total_intervals.
        Any remainder is distributed to the final intervals.
        """
        if self.vested_at_termination is not None:
            return self.vested_at_termination

        if self.revoked:
            return self.released_amount

        elapsed = (current_time - self.start_time).total_seconds()

        if elapsed < 0:
            return 0

        if elapsed >= self.duration_seconds:
            return self.total_amount

        # During cliff period, nothing vests
        if elapsed < self.cliff_seconds:
            return 0

        # Calculate intervals elapsed after cliff
        time_after_cliff = elapsed - self.cliff_seconds
        intervals_elapsed = int(time_after_cliff // self.interval_seconds)

        # Get interval calculations
        total_intervals = self.total_intervals()
        amount_per = self.amount_per_interval()
        rem = self.remainder()

        if total_intervals == 0:
            return self.total_amount

        # Base vested amount
        vested = amount_per * intervals_elapsed

        # Distribute remainder to final intervals
        # If remainder is N, the last N intervals each get +1
        if intervals_elapsed > (total_intervals - rem):
            extra_intervals = intervals_elapsed - (total_intervals - rem)
            vested += extra_intervals

        # Cap at total amount
        return min(vested, self.total_amount)

    def calculate_releasable_intervals(self, current_time: datetime) -> int:
        """Calculate how many NEW intervals are available to release"""
        elapsed = (current_time - self.start_time).total_seconds()

        if elapsed < 0 or elapsed < self.cliff_seconds:
            return 0

        # If past total duration, all intervals should be released
        if elapsed >= self.duration_seconds:
            return self.total_intervals() - self.intervals_released

        # Calculate intervals elapsed after cliff
        time_after_cliff = elapsed - self.cliff_seconds
        intervals_elapsed = int(time_after_cliff // self.interval_seconds)

        # Return new intervals (not yet released)
        return max(0, intervals_elapsed - self.intervals_released)

    def __repr__(self):
        return f"<VestingSchedule {self.beneficiary[:8]}... ({self.total_amount} tokens, {self.interval} intervals)>"
