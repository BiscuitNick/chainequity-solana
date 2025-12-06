"""Cap-table snapshot models"""
from datetime import datetime
from sqlalchemy import Column, Integer, BigInteger, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import relationship

from app.models.database import Base


class CapTableSnapshot(Base):
    """Cap-table snapshot at a specific slot"""
    __tablename__ = "captable_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=False)
    total_supply = Column(BigInteger, nullable=False)
    holder_count = Column(Integer, nullable=False)
    snapshot_data = Column(JSON, nullable=False)  # Full cap-table as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="snapshots")

    def __repr__(self):
        return f"<CapTableSnapshot slot={self.slot} holders={self.holder_count}>"


class CurrentBalance(Base):
    """Current balance for each wallet (materialized view updated by indexer)"""
    __tablename__ = "current_balances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    wallet = Column(String(44), nullable=False, index=True)
    balance = Column(BigInteger, nullable=False, default=0)
    last_updated_slot = Column(BigInteger, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<CurrentBalance {self.wallet[:8]}... ({self.balance})>"
