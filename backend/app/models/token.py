"""Token models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship

from app.models.database import Base


class Token(Base):
    """Security token created by the factory"""
    __tablename__ = "tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, unique=True, nullable=False, index=True)
    on_chain_config = Column(String(44), unique=True, nullable=False)
    mint_address = Column(String(44), unique=True, nullable=False)
    symbol = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(50), nullable=False)
    decimals = Column(Integer, nullable=False, default=0)
    total_supply = Column(BigInteger, nullable=False)
    features = Column(JSON, nullable=False)
    is_paused = Column(Boolean, default=False)

    # Current valuation cache (updated when valuation events occur)
    current_valuation = Column(BigInteger, nullable=True)  # Company valuation in cents
    current_price_per_share = Column(BigInteger, nullable=True)  # Price per share in cents
    last_valuation_date = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    wallets = relationship("Wallet", back_populates="token", lazy="dynamic")
    transfers = relationship("Transfer", back_populates="token", lazy="dynamic")
    vesting_schedules = relationship("VestingSchedule", back_populates="token", lazy="dynamic")
    issuances = relationship("TokenIssuance", back_populates="token", lazy="dynamic")
    dividend_rounds = relationship("DividendRound", back_populates="token", lazy="dynamic")
    proposals = relationship("Proposal", back_populates="token", lazy="dynamic")
    corporate_actions = relationship("CorporateAction", back_populates="token", lazy="dynamic")
    snapshots = relationship("CapTableSnapshot", back_populates="token", lazy="dynamic")

    # Investment modeling relationships
    share_classes = relationship("ShareClass", back_populates="token", lazy="dynamic")
    share_positions = relationship("SharePosition", back_populates="token", lazy="dynamic")
    funding_rounds = relationship("FundingRound", back_populates="token", lazy="dynamic")
    convertible_instruments = relationship("ConvertibleInstrument", back_populates="token", lazy="dynamic")
    valuation_events = relationship("ValuationEvent", back_populates="token", lazy="dynamic")

    def __repr__(self):
        return f"<Token {self.symbol} (ID: {self.token_id})>"


class TokenFeatures:
    """Token feature flags (used for JSON field)"""
    @staticmethod
    def default() -> dict:
        return {
            "vesting_enabled": True,
            "governance_enabled": True,
            "dividends_enabled": True,
            "transfer_restrictions_enabled": True,
            "upgradeable": True,
        }
