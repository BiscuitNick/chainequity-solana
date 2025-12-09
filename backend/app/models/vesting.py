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


class VestingSchedule(Base):
    """Vesting schedule for a beneficiary"""
    __tablename__ = "vesting_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
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
    vesting_type = Column(String(20), nullable=False)  # linear, cliff_then_linear, stepped
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

    def calculate_vested(self, current_time: datetime) -> int:
        """Calculate vested amount at a given time"""
        if self.vested_at_termination is not None:
            return self.vested_at_termination

        if self.revoked:
            return self.released_amount

        elapsed = (current_time - self.start_time).total_seconds()

        if elapsed < 0:
            return 0

        if elapsed >= self.duration_seconds:
            return self.total_amount

        if self.vesting_type in ("linear", "continuous"):
            return int(self.total_amount * elapsed / self.duration_seconds)
        elif self.vesting_type == "cliff_then_linear":
            if elapsed < self.cliff_seconds:
                return 0
            time_after_cliff = elapsed - self.cliff_seconds
            remaining_duration = self.duration_seconds - self.cliff_seconds
            if remaining_duration == 0:
                return self.total_amount
            return int(self.total_amount * time_after_cliff / remaining_duration)
        elif self.vesting_type == "stepped":
            period_seconds = 30 * 24 * 60 * 60  # 30 days
            periods_elapsed = int(elapsed / period_seconds)
            total_periods = int(self.duration_seconds / period_seconds)
            if total_periods == 0:
                return self.total_amount
            return int(self.total_amount * periods_elapsed / total_periods)

        return 0

    def __repr__(self):
        return f"<VestingSchedule {self.beneficiary[:8]}... ({self.total_amount} tokens)>"
