from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger, Text
from sqlalchemy.orm import relationship
from app.models.database import Base


class ValuationEvent(Base):
    """
    Valuation tracking for historical and current values.

    Records valuation events from:
    - Funding rounds (automatic when round closes)
    - Manual updates (admin sets valuation)
    - 409A valuations (formal appraisals)
    """
    __tablename__ = "valuation_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Valuation type
    event_type = Column(String(20), nullable=False)  # "funding_round", "manual", "409a"

    # Values (all in cents for precision)
    valuation = Column(BigInteger, nullable=False)  # Company valuation
    price_per_share = Column(BigInteger, nullable=False)  # Derived: valuation / fully_diluted_shares
    fully_diluted_shares = Column(BigInteger, nullable=False)  # Total shares at time of valuation

    # Reference to funding round if applicable
    funding_round_id = Column(Integer, ForeignKey("funding_rounds.id"), nullable=True)

    # Metadata
    effective_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    notes = Column(Text, nullable=True)
    created_by = Column(String(44), nullable=True)  # Admin wallet that created this

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="valuation_events")
    funding_round = relationship("FundingRound")
