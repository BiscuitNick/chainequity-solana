"""Transaction models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.models.database import Base


class Transfer(Base):
    """Token transfer record"""
    __tablename__ = "transfers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    signature = Column(String(88), nullable=False, unique=True)
    from_wallet = Column(String(44), nullable=False, index=True)
    to_wallet = Column(String(44), nullable=False, index=True)
    amount = Column(BigInteger, nullable=False)
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=False)
    status = Column(String(20), nullable=False)  # success, failed, blocked
    failure_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="transfers")
    from_wallet_rel = relationship(
        "Wallet",
        back_populates="sent_transfers",
        foreign_keys=[from_wallet],
        primaryjoin="Transfer.from_wallet == Wallet.address",
    )
    to_wallet_rel = relationship(
        "Wallet",
        back_populates="received_transfers",
        foreign_keys=[to_wallet],
        primaryjoin="Transfer.to_wallet == Wallet.address",
    )

    def __repr__(self):
        return f"<Transfer {self.signature[:16]}... ({self.amount})>"


class CorporateAction(Base):
    """Corporate action log (splits, symbol changes, etc.)"""
    __tablename__ = "corporate_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    action_type = Column(String(50), nullable=False, index=True)  # split, symbol_change, dividend
    action_data = Column(JSON, nullable=False)
    executed_at = Column(DateTime, default=datetime.utcnow)
    executed_by = Column(String(44), nullable=False)
    signature = Column(String(88), nullable=False)
    slot = Column(BigInteger, nullable=False)

    # Relationships
    token = relationship("Token", back_populates="corporate_actions")

    def __repr__(self):
        return f"<CorporateAction {self.action_type} (token_id={self.token_id})>"


class Transaction(Base):
    """Indexed Solana transaction"""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    signature = Column(String(88), nullable=False, unique=True, index=True)
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=True)
    program_id = Column(String(44), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="success")
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Transaction {self.signature[:16]}... (slot={self.slot})>"
