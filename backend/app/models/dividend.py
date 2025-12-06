"""Dividend models"""
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.database import Base


class DividendStatus(str, Enum):
    """Dividend round status"""
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"


class DividendRound(Base):
    """Dividend distribution round"""
    __tablename__ = "dividend_rounds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    on_chain_address = Column(String(44), nullable=False, unique=True)
    round_number = Column(Integer, nullable=False)
    payment_token = Column(String(44), nullable=False)
    total_pool = Column(BigInteger, nullable=False)
    amount_per_share = Column(BigInteger, nullable=False)
    snapshot_slot = Column(BigInteger, nullable=False)
    status = Column(String(20), nullable=False)  # pending, active, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    # Relationships
    token = relationship("Token", back_populates="dividend_rounds")
    claims = relationship("DividendClaim", back_populates="round", lazy="dynamic")

    def __repr__(self):
        return f"<DividendRound {self.round_number} ({self.status})>"


class DividendClaim(Base):
    """Dividend claim record"""
    __tablename__ = "dividend_claims"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("dividend_rounds.id"), nullable=False)
    wallet = Column(String(44), nullable=False, index=True)
    amount = Column(BigInteger, nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow)
    signature = Column(String(88), nullable=False)

    # Relationships
    round = relationship("DividendRound", back_populates="claims")

    def __repr__(self):
        return f"<DividendClaim {self.wallet[:8]}... ({self.amount})>"
