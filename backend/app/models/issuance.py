"""Token issuance models for instant token awards"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.models.database import Base


class TokenIssuance(Base):
    """Record of instant token issuance to a wallet"""
    __tablename__ = "token_issuances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    recipient = Column(String(44), nullable=False, index=True)
    amount = Column(BigInteger, nullable=False)

    # Issuance metadata
    issued_by = Column(String(44), nullable=True)  # Admin who issued
    notes = Column(Text, nullable=True)

    # Transaction tracking
    tx_signature = Column(String(88), nullable=True)  # Solana tx signature
    status = Column(String(20), nullable=False, default="pending")  # pending, completed, failed

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    token = relationship("Token", back_populates="issuances")

    def __repr__(self):
        return f"<TokenIssuance {self.recipient[:8]}... ({self.amount} tokens)>"
