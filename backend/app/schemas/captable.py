"""Cap-table schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from enum import Enum


class ExportFormat(str, Enum):
    CSV = "csv"
    JSON = "json"
    PDF = "pdf"


class CapTableEntryResponse(BaseModel):
    wallet: str
    balance: int
    ownership_pct: float
    vested: int
    unvested: int
    lockout_until: Optional[datetime] = None
    daily_limit: Optional[int] = None
    status: str


class CapTableResponse(BaseModel):
    slot: int
    timestamp: datetime
    total_supply: int
    holder_count: int
    holders: List[CapTableEntryResponse]


class SnapshotResponse(BaseModel):
    slot: int
    timestamp: datetime
    holder_count: int


# Enhanced Cap Table Schemas with Dollar Values
class ShareClassSummary(BaseModel):
    """Summary of a share class in the cap table"""
    id: int
    name: str
    symbol: str
    priority: int
    preference_multiple: float
    total_shares: int
    total_value: int  # In cents
    holder_count: int


class EnhancedCapTableEntry(BaseModel):
    """Enhanced cap table entry with dollar values and share class info"""
    wallet: str
    share_class_id: int
    share_class_name: str
    share_class_symbol: str
    shares: int
    cost_basis: int  # In cents - what was paid
    current_value: int  # In cents - at current valuation
    ownership_pct: float  # Percentage of total shares
    class_ownership_pct: float  # Percentage within share class
    unrealized_gain: int  # current_value - cost_basis
    price_per_share: int  # Current price per share in cents
    preference_amount: int  # Liquidation preference (cost_basis * preference_multiple)


class EnhancedCapTableResponse(BaseModel):
    """Enhanced cap table with full investment tracking"""
    slot: int
    timestamp: datetime

    # Valuation info
    current_valuation: int  # In cents
    price_per_share: int  # In cents
    last_valuation_date: Optional[datetime] = None

    # Share statistics
    total_shares: int
    total_cost_basis: int  # Total invested
    total_current_value: int  # At current valuation
    holder_count: int

    # Share class breakdown
    share_classes: List[ShareClassSummary]

    # Individual positions
    positions: List[EnhancedCapTableEntry]


class WalletSummary(BaseModel):
    """Summary of all positions for a single wallet"""
    wallet: str
    total_shares: int
    total_cost_basis: int
    total_current_value: int
    total_ownership_pct: float
    total_unrealized_gain: int
    positions: List[EnhancedCapTableEntry]


class EnhancedCapTableByWalletResponse(BaseModel):
    """Enhanced cap table grouped by wallet"""
    slot: int
    timestamp: datetime
    current_valuation: int
    price_per_share: int
    total_shares: int
    holder_count: int
    wallets: List[WalletSummary]
