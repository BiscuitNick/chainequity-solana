"""Wallet and allowlist models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship

from app.models.database import Base


class Wallet(Base):
    """Wallet on allowlist for a token"""
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    address = Column(String(44), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, active, revoked, suspended
    kyc_level = Column(Integer, default=0)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String(44), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="wallets")
    restrictions = relationship("WalletRestriction", back_populates="wallet", uselist=False)
    sent_transfers = relationship(
        "Transfer",
        back_populates="from_wallet_rel",
        foreign_keys="Transfer.from_wallet",
        lazy="dynamic"
    )
    received_transfers = relationship(
        "Transfer",
        back_populates="to_wallet_rel",
        foreign_keys="Transfer.to_wallet",
        lazy="dynamic"
    )

    __table_args__ = (
        # Unique constraint on token_id + address
        {"sqlite_autoincrement": True},
    )

    def __repr__(self):
        return f"<Wallet {self.address[:8]}... ({self.status})>"


class WalletRestriction(Base):
    """Per-wallet transfer restrictions"""
    __tablename__ = "wallet_restrictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, unique=True)
    daily_limit = Column(BigInteger, nullable=True)
    lockout_until = Column(DateTime, nullable=True)
    max_balance = Column(BigInteger, nullable=True)
    transferred_today = Column(BigInteger, default=0)
    last_transfer_date = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    wallet = relationship("Wallet", back_populates="restrictions")

    def __repr__(self):
        return f"<WalletRestriction wallet_id={self.wallet_id}>"
