from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, BigInteger, Text, Date
from sqlalchemy.orm import relationship
from app.models.database import Base


class ConvertibleInstrument(Base):
    """SAFE or Convertible Note"""
    __tablename__ = "convertible_instruments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Identity
    instrument_type = Column(String(20), nullable=False)  # "safe", "convertible_note"
    name = Column(String(100), nullable=True)  # "YC SAFE - Investor A"

    # Holder
    holder_wallet = Column(String(44), nullable=False, index=True)
    holder_name = Column(String(100), nullable=True)

    # Principal (in cents)
    principal_amount = Column(BigInteger, nullable=False)

    # Conversion terms
    valuation_cap = Column(BigInteger, nullable=True)  # In cents, null = no cap
    discount_rate = Column(Float, nullable=True)  # 0.20 = 20% discount

    # For convertible notes only
    interest_rate = Column(Float, nullable=True)  # 0.05 = 5% annual
    maturity_date = Column(Date, nullable=True)

    # SAFE type
    safe_type = Column(String(20), nullable=True)  # "pre_money", "post_money"

    # Conversion status
    status = Column(String(20), nullable=False, default="outstanding")  # outstanding, converted, cancelled
    converted_at = Column(DateTime, nullable=True)
    conversion_round_id = Column(Integer, ForeignKey("funding_rounds.id"), nullable=True)
    shares_received = Column(BigInteger, nullable=True)
    conversion_price = Column(BigInteger, nullable=True)  # Actual price used at conversion (in cents)

    # Metadata
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="convertible_instruments")
    conversion_round = relationship("FundingRound")

    def calculate_accrued_amount(self, as_of_date: datetime = None) -> int:
        """
        Calculate principal + accrued interest for convertible notes.
        SAFEs return principal only (no interest).

        Args:
            as_of_date: Date to calculate interest up to. Defaults to now.

        Returns:
            Total amount including accrued interest (in cents)
        """
        if self.instrument_type != "convertible_note" or not self.interest_rate:
            return self.principal_amount

        as_of = as_of_date or datetime.utcnow()
        days_elapsed = (as_of - self.created_at).days
        years_elapsed = days_elapsed / 365.0

        # Simple interest calculation
        accrued = self.principal_amount * (1 + self.interest_rate * years_elapsed)
        return int(accrued)

    def calculate_conversion_price(self, round_price: int, total_shares: int = None) -> int:
        """
        Calculate the effective conversion price based on discount and cap.

        Args:
            round_price: Price per share of the funding round (in cents)
            total_shares: Total shares outstanding (needed for cap calculation)

        Returns:
            Effective conversion price (in cents) - the lower of discounted or capped price
        """
        prices = [round_price]

        # Apply discount (e.g., 20% discount means paying 80% of round price)
        if self.discount_rate:
            discounted = int(round_price * (1 - self.discount_rate))
            prices.append(discounted)

        # Apply valuation cap
        if self.valuation_cap and total_shares and total_shares > 0:
            cap_price = self.valuation_cap // total_shares
            prices.append(cap_price)

        # Investor gets the best (lowest) price
        return max(min(prices), 1)  # Minimum 1 cent
