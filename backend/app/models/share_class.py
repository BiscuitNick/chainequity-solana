from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from app.models.database import Base


class ShareClass(Base):
    """Share class with liquidation preferences"""
    __tablename__ = "share_classes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Identity
    name = Column(String(50), nullable=False)  # "Common", "Series A Preferred", etc.
    symbol = Column(String(10), nullable=False)  # "COM", "SER-A", etc.

    # Liquidation Preferences
    # Priority: 0 = highest priority (debt), 99 = common stock (lowest)
    priority = Column(Integer, nullable=False, default=99)
    # Preference multiple: 1.0 = 1x, 2.0 = 2x (investor gets 2x before lower tiers)
    preference_multiple = Column(Float, nullable=False, default=1.0)

    # Metadata
    is_convertible = Column(Boolean, default=False)  # Can convert to common
    converts_to_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=True)

    # Voting (future use)
    votes_per_share = Column(Integer, default=1)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="share_classes")
    positions = relationship("SharePosition", back_populates="share_class")
    converts_to = relationship("ShareClass", remote_side=[id])


class SharePosition(Base):
    """A holder's position in a specific share class"""
    __tablename__ = "share_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    share_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=False, index=True)
    wallet = Column(String(44), nullable=False, index=True)

    # Position details
    shares = Column(BigInteger, nullable=False, default=0)
    cost_basis = Column(BigInteger, nullable=False, default=0)  # Total amount paid (in cents)
    price_per_share = Column(BigInteger, nullable=False, default=0)  # Price at acquisition (in cents)

    # Timestamps
    acquired_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="share_positions")
    share_class = relationship("ShareClass", back_populates="positions")

    @property
    def preference_amount(self) -> int:
        """Calculate liquidation preference amount (cost_basis * preference_multiple)"""
        if self.share_class:
            return int(self.cost_basis * self.share_class.preference_multiple)
        return self.cost_basis
