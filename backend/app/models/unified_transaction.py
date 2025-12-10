"""Unified transaction model for event sourcing."""
import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, BigInteger, Float, DateTime, Text,
    ForeignKey, Index, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.models.database import Base


class TransactionType(str, enum.Enum):
    """All transaction types in the system."""
    # Allowlist
    APPROVAL = "approval"
    REVOCATION = "revocation"

    # Token operations
    MINT = "mint"
    TRANSFER = "transfer"
    BURN = "burn"

    # Vesting
    VESTING_SCHEDULE_CREATE = "vesting_schedule_create"
    VESTING_RELEASE = "vesting_release"
    VESTING_TERMINATE = "vesting_terminate"

    # Share operations
    SHARE_GRANT = "share_grant"

    # Governance
    PROPOSAL_CREATE = "proposal_create"
    VOTE = "vote"
    PROPOSAL_EXECUTE = "proposal_execute"

    # Dividends
    DIVIDEND_ROUND_CREATE = "dividend_round_create"
    DIVIDEND_PAYMENT = "dividend_payment"

    # Corporate actions
    STOCK_SPLIT = "stock_split"
    SYMBOL_CHANGE = "symbol_change"
    PAUSE = "pause"

    # Investment operations
    FUNDING_ROUND_CREATE = "funding_round_create"
    FUNDING_ROUND_CLOSE = "funding_round_close"
    INVESTMENT = "investment"
    CONVERTIBLE_CREATE = "convertible_create"
    CONVERTIBLE_CONVERT = "convertible_convert"
    VALUATION_UPDATE = "valuation_update"


class UnifiedTransaction(Base):
    """
    Single table capturing all state-changing events.

    Historical state is reconstructed by replaying transactions up to target slot.
    Every state change in the system should be recorded here with its slot number.
    """
    __tablename__ = "unified_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Temporal tracking - REQUIRED for every transaction
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Transaction type (discriminator)
    tx_type = Column(SQLEnum(TransactionType), nullable=False, index=True)

    # Core identifiers
    wallet = Column(String(44), nullable=True, index=True)  # Primary wallet involved
    wallet_to = Column(String(44), nullable=True, index=True)  # Secondary wallet (for transfers)

    # Numeric values (interpretation depends on tx_type)
    amount = Column(BigInteger, nullable=True)  # Shares/tokens involved
    amount_secondary = Column(BigInteger, nullable=True)  # Secondary amount (e.g., cost_basis)

    # Share class tracking (captured at transaction time for investment analysis)
    share_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=True, index=True)
    priority = Column(Integer, nullable=True)  # Liquidation priority at tx time
    preference_multiple = Column(Float, nullable=True)  # Preference multiple at tx time
    price_per_share = Column(BigInteger, nullable=True)  # Price per share at tx time

    # Reference to related entities
    reference_id = Column(Integer, nullable=True)  # ID of related entity
    reference_type = Column(String(50), nullable=True)  # Type: vesting_schedule, proposal, etc.

    # Flexible data for type-specific fields
    data = Column(JSONB, nullable=True)

    # Transaction metadata
    tx_signature = Column(String(100), nullable=True, index=True)  # Solana signature
    triggered_by = Column(String(100), nullable=True)  # Actor/system that triggered
    notes = Column(Text, nullable=True)

    # Relationships
    token = relationship("Token")
    share_class = relationship("ShareClass")

    # Composite indexes for efficient queries
    __table_args__ = (
        Index('ix_unified_tx_token_slot', 'token_id', 'slot'),
        Index('ix_unified_tx_wallet_slot', 'wallet', 'slot'),
        Index('ix_unified_tx_type_token_slot', 'tx_type', 'token_id', 'slot'),
        Index('ix_unified_tx_share_class_slot', 'share_class_id', 'slot'),
        Index('ix_unified_tx_reference', 'reference_type', 'reference_id'),
    )

    def __repr__(self):
        return f"<UnifiedTransaction(id={self.id}, type={self.tx_type}, slot={self.slot}, wallet={self.wallet})>"
