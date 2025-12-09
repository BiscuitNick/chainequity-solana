"""
Historical state tracking models for point-in-time reconstruction.

This module implements an event-sourcing pattern to track all state changes
with their associated Solana slot numbers, enabling reconstruction of any
model's state at any historical point in time.
"""
from datetime import datetime
from typing import Optional, Any, Dict
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    ForeignKey,
    Index,
    Text,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
import enum

from app.models.database import Base


class ChangeType(str, enum.Enum):
    """Types of state changes that can be tracked."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class StateChange(Base):
    """
    Immutable log of all state changes across the system.

    This table serves as the source of truth for reconstructing
    any entity's state at any point in time (identified by slot).

    Example usage:
    - When a Wallet status changes from "pending" to "active",
      we record the old state, new state, and the slot at which
      the change occurred.
    - To reconstruct Wallet state at slot X, we find the most recent
      StateChange for that wallet where slot <= X.
    """
    __tablename__ = "state_changes"

    id = Column(Integer, primary_key=True)

    # When this change occurred (Solana slot)
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=True)

    # What entity changed
    entity_type = Column(String(50), nullable=False, index=True)  # e.g., "wallet", "token", "share_position"
    entity_id = Column(String(100), nullable=False, index=True)   # Primary key or composite key as string
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=True, index=True)  # For filtering by token

    # Type of change
    change_type = Column(SQLEnum(ChangeType), nullable=False)

    # The actual state data
    old_state = Column(JSONB, nullable=True)   # NULL for CREATE
    new_state = Column(JSONB, nullable=True)   # NULL for DELETE

    # What triggered the change
    triggered_by = Column(String(100), nullable=True)  # e.g., "api:approve_wallet", "indexer:transfer"
    tx_signature = Column(String(100), nullable=True)  # Solana transaction if applicable

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)

    # Composite index for efficient point-in-time queries
    __table_args__ = (
        Index('ix_state_changes_entity_slot', 'entity_type', 'entity_id', 'slot'),
        Index('ix_state_changes_token_slot', 'token_id', 'slot'),
        Index('ix_state_changes_type_token_slot', 'entity_type', 'token_id', 'slot'),
    )


class CapTableSnapshotV2(Base):
    """
    Enhanced cap table snapshots that include ALL relevant state.

    Unlike the original CapTableSnapshot which only stores holder balances,
    this version stores complete reconstructable state including:
    - All wallet statuses
    - All share positions
    - Token state (supply, paused, etc.)
    - Vesting state

    These are created periodically (e.g., every 1000 slots) and on significant events.
    """
    __tablename__ = "captable_snapshots_v2"

    id = Column(Integer, primary_key=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # When this snapshot was taken
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=True)

    # Summary metrics for quick access
    total_supply = Column(BigInteger, nullable=False)
    holder_count = Column(Integer, nullable=False)
    total_shares = Column(BigInteger, nullable=False, default=0)  # Off-chain share positions

    # Complete state snapshots as JSON
    # This denormalizes data for fast historical queries
    token_state = Column(JSONB, nullable=False)      # Token record as JSON
    holders = Column(JSONB, nullable=False)          # List of {wallet, balance, status}
    share_positions = Column(JSONB, nullable=False)  # List of share positions
    vesting_schedules = Column(JSONB, nullable=False)  # List of vesting schedules with calculated values
    share_classes = Column(JSONB, nullable=False)    # Share class definitions at this point

    # What triggered this snapshot
    trigger = Column(String(50), nullable=False)  # "periodic", "transfer", "issuance", "manual"

    created_at = Column(DateTime, default=datetime.utcnow)

    # Composite index for efficient lookup
    __table_args__ = (
        Index('ix_captable_snapshots_v2_token_slot', 'token_id', 'slot'),
    )

    # Relationship
    token = relationship("Token", backref="snapshots_v2")
