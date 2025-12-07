"""Dividend models"""
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship

from app.models.database import Base


class DividendStatus(str, Enum):
    """Dividend round status"""
    PENDING = "pending"  # Created but not yet distributed
    DISTRIBUTING = "distributing"  # Currently distributing (for batched distributions)
    COMPLETED = "completed"  # All payments distributed
    FAILED = "failed"  # Distribution failed


class PaymentStatus(str, Enum):
    """Individual payment status"""
    PENDING = "pending"  # Not yet sent
    SENT = "sent"  # Successfully distributed
    FAILED = "failed"  # Failed to distribute


class DividendRound(Base):
    """Dividend distribution round"""
    __tablename__ = "dividend_rounds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    on_chain_address = Column(String(44), nullable=True, unique=True)  # nullable for off-chain created rounds
    round_number = Column(Integer, nullable=False)
    payment_token = Column(String(44), nullable=False)
    total_pool = Column(BigInteger, nullable=False)
    amount_per_share = Column(Float, nullable=False)  # Changed to Float for fractional amounts
    snapshot_slot = Column(BigInteger, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending")  # pending, distributing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    distributed_at = Column(DateTime, nullable=True)  # When distribution completed
    total_recipients = Column(Integer, nullable=False, default=0)  # Total shareholders at snapshot
    total_batches = Column(Integer, nullable=False, default=0)  # Number of batches needed
    completed_batches = Column(Integer, nullable=False, default=0)  # Batches completed so far

    # Relationships
    token = relationship("Token", back_populates="dividend_rounds")
    payments = relationship("DividendPayment", back_populates="round", lazy="dynamic")

    def __repr__(self):
        return f"<DividendRound {self.round_number} ({self.status})>"


class DividendPayment(Base):
    """Individual dividend payment record (auto-distributed)"""
    __tablename__ = "dividend_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("dividend_rounds.id"), nullable=False, index=True)
    wallet = Column(String(44), nullable=False, index=True)
    shares = Column(BigInteger, nullable=False, default=0)  # Number of shares held at snapshot
    amount = Column(BigInteger, nullable=False)  # Total dividend amount (shares * amount_per_share)
    status = Column(String(20), nullable=False, default="pending")  # pending, sent, failed
    batch_number = Column(Integer, nullable=False, default=0)  # Which batch this payment belongs to
    created_at = Column(DateTime, default=datetime.utcnow)
    distributed_at = Column(DateTime, nullable=True)  # When payment was sent
    signature = Column(String(88), nullable=True)  # Transaction signature (null until sent)
    error_message = Column(String(500), nullable=True)  # Error message if failed

    # Relationships
    round = relationship("DividendRound", back_populates="payments")

    def __repr__(self):
        return f"<DividendPayment {self.wallet[:8]}... ${self.amount} ({self.status})>"


# Keep DividendClaim as alias for backwards compatibility during migration
DividendClaim = DividendPayment
