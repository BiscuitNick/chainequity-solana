from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger, Text, JSON
from sqlalchemy.orm import relationship
from app.models.database import Base


class FundingRound(Base):
    """Investment round tracking"""
    __tablename__ = "funding_rounds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Round identity
    name = Column(String(50), nullable=False)  # "Seed", "Series A", etc.
    round_type = Column(String(20), nullable=False)  # seed, series_a, series_b, bridge, etc.

    # Valuation (all amounts in cents for precision)
    pre_money_valuation = Column(BigInteger, nullable=False)
    amount_raised = Column(BigInteger, nullable=False, default=0)
    post_money_valuation = Column(BigInteger, nullable=False)  # pre + raised
    price_per_share = Column(BigInteger, nullable=False)  # In cents

    # Shares issued
    shares_issued = Column(BigInteger, nullable=False, default=0)
    share_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=False)

    # Status
    status = Column(String(20), nullable=False, default="pending")  # pending, completed, cancelled
    closed_at = Column(DateTime, nullable=True)

    # On-chain tracking
    tx_signature = Column(String(88), nullable=True)
    slot = Column(BigInteger, nullable=True)

    # Metadata
    notes = Column(Text, nullable=True)
    terms = Column(JSON, nullable=True)  # Additional terms as JSON

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="funding_rounds")
    share_class = relationship("ShareClass")
    investments = relationship("Investment", back_populates="funding_round", lazy="selectin")


class Investment(Base):
    """Individual investment within a funding round"""
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    funding_round_id = Column(Integer, ForeignKey("funding_rounds.id"), nullable=False, index=True)

    # Investor
    investor_wallet = Column(String(44), nullable=False, index=True)
    investor_name = Column(String(100), nullable=True)  # Optional display name

    # Investment details (amounts in cents)
    amount = Column(BigInteger, nullable=False)
    shares_received = Column(BigInteger, nullable=False)
    price_per_share = Column(BigInteger, nullable=False)  # May differ from round if special terms

    # Status
    status = Column(String(20), nullable=False, default="pending")  # pending, completed, cancelled

    # On-chain tracking
    tx_signature = Column(String(88), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    token = relationship("Token")
    funding_round = relationship("FundingRound", back_populates="investments")
