"""Schemas for investment modeling APIs"""
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum


# =============================================================================
# Enums
# =============================================================================

class RoundType(str, Enum):
    """Types of funding rounds"""
    PRE_SEED = "pre_seed"
    SEED = "seed"
    SERIES_A = "series_a"
    SERIES_B = "series_b"
    SERIES_C = "series_c"
    BRIDGE = "bridge"
    REVALUATION = "revaluation"  # Zero-dollar round to change company valuation
    OTHER = "other"


class InstrumentType(str, Enum):
    """Types of convertible instruments"""
    SAFE = "safe"
    CONVERTIBLE_NOTE = "convertible_note"


class SafeType(str, Enum):
    """Types of SAFE agreements"""
    PRE_MONEY = "pre_money"
    POST_MONEY = "post_money"


# =============================================================================
# Share Class Schemas
# =============================================================================

class CreateShareClassRequest(BaseModel):
    """Request to create a new share class"""
    name: str  # "Common", "Series A Preferred"
    symbol: str  # "COM", "SER-A"
    priority: int = 99  # 0 = highest priority (debt), 99 = common
    preference_multiple: float = 1.0  # 1x, 1.5x, 2x


class ShareClassResponse(BaseModel):
    """Share class response"""
    id: int
    name: str
    symbol: str
    priority: int
    preference_multiple: float
    is_convertible: bool
    votes_per_share: int
    created_at: datetime

    class Config:
        from_attributes = True


class SharePositionResponse(BaseModel):
    """A holder's position in a share class"""
    id: Optional[int] = None
    wallet: str
    share_class: ShareClassResponse
    shares: int
    cost_basis: int  # In cents
    price_per_share: int  # In cents
    current_value: int  # shares * current_price_per_share
    preference_amount: int  # cost_basis * preference_multiple
    slot: Optional[int] = None  # Solana slot at time of issuance
    acquired_at: Optional[datetime] = None


# =============================================================================
# Share Issuance Schemas
# =============================================================================

class IssueSharesRequest(BaseModel):
    """Request to issue shares to a wallet"""
    recipient_wallet: str
    share_class_id: int
    shares: int
    cost_basis: int = 0  # In cents - what the recipient paid (0 for founder grants)
    price_per_share: int = 0  # In cents - price at time of issuance
    notes: Optional[str] = None


class IssueSharesResponse(BaseModel):
    """Response from share issuance"""
    id: int
    recipient_wallet: str
    share_class: ShareClassResponse
    shares: int
    cost_basis: int
    price_per_share: int
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class BulkIssueSharesRequest(BaseModel):
    """Request to issue shares to multiple wallets"""
    share_class_id: int
    price_per_share: int = 0  # In cents
    issuances: List[IssueSharesRequest]


# =============================================================================
# Investment Schemas
# =============================================================================

class InvestmentResponse(BaseModel):
    """Individual investment within a funding round"""
    id: int
    investor_wallet: str
    investor_name: Optional[str]
    amount: int  # In cents
    shares_received: int
    price_per_share: int  # In cents
    status: str
    tx_signature: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AddInvestmentRequest(BaseModel):
    """Request to add an investment to a funding round"""
    investor_wallet: str
    investor_name: Optional[str] = None
    amount: int  # In cents


# =============================================================================
# Funding Round Schemas
# =============================================================================

class CreateFundingRoundRequest(BaseModel):
    """Request to create a new funding round"""
    name: str  # "Seed Round", "Series A"
    round_type: RoundType
    pre_money_valuation: int  # In cents
    share_class_id: int
    notes: Optional[str] = None


class FundingRoundResponse(BaseModel):
    """Funding round response"""
    id: int
    name: str
    round_type: str
    pre_money_valuation: int  # In cents
    amount_raised: int  # In cents
    post_money_valuation: int  # In cents
    price_per_share: int  # In cents
    shares_issued: int
    share_class: ShareClassResponse
    status: str
    closed_at: Optional[datetime]
    investments: List[InvestmentResponse]
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Convertible Instrument Schemas
# =============================================================================

class CreateConvertibleRequest(BaseModel):
    """Request to create a convertible instrument (SAFE or note)"""
    instrument_type: InstrumentType
    name: Optional[str] = None
    holder_wallet: str
    holder_name: Optional[str] = None
    principal_amount: int  # In cents
    valuation_cap: Optional[int] = None  # In cents
    discount_rate: Optional[float] = None  # 0.20 = 20%
    # For convertible notes
    interest_rate: Optional[float] = None  # 0.05 = 5%
    maturity_date: Optional[date] = None
    # For SAFEs
    safe_type: Optional[SafeType] = None
    notes: Optional[str] = None


class ConvertibleResponse(BaseModel):
    """Convertible instrument response"""
    id: int
    instrument_type: str
    name: Optional[str]
    holder_wallet: str
    holder_name: Optional[str]
    principal_amount: int  # In cents
    accrued_amount: int  # Principal + interest (for notes)
    valuation_cap: Optional[int]
    discount_rate: Optional[float]
    interest_rate: Optional[float]
    maturity_date: Optional[date]
    safe_type: Optional[str]
    status: str
    converted_at: Optional[datetime]
    shares_received: Optional[int]
    conversion_price: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class ConvertConvertibleRequest(BaseModel):
    """Request to convert a convertible at a funding round"""
    funding_round_id: int


# =============================================================================
# Valuation Schemas
# =============================================================================

class CreateValuationRequest(BaseModel):
    """Request to create a manual valuation event"""
    valuation: int  # In cents
    event_type: str = "manual"  # "manual", "409a"
    notes: Optional[str] = None


class ValuationResponse(BaseModel):
    """Valuation event response"""
    id: int
    event_type: str
    valuation: int  # In cents
    price_per_share: int  # In cents
    fully_diluted_shares: int
    funding_round_id: Optional[int]
    effective_date: datetime
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Simulator Schemas
# =============================================================================

class WaterfallRequest(BaseModel):
    """Request to simulate liquidation waterfall"""
    exit_amount: int  # In cents


class WaterfallScenariosRequest(BaseModel):
    """Request to simulate waterfall for multiple exit amounts"""
    exit_amounts: List[int]  # In cents


class WaterfallPayoutResponse(BaseModel):
    """Payout for a single holder in waterfall"""
    wallet: str
    share_class_name: str
    priority: int
    shares: int
    cost_basis: int
    preference_amount: int
    preference_multiple: float
    payout: int
    payout_source: str  # "preference", "partial_preference", "conversion", "common", "none"


class WaterfallTierResponse(BaseModel):
    """Results for a single priority tier"""
    priority: int
    total_preference: int
    amount_available: int
    amount_distributed: int
    fully_satisfied: bool
    payouts: List[WaterfallPayoutResponse]


class WaterfallResponse(BaseModel):
    """Complete waterfall simulation result"""
    exit_amount: int
    total_shares: int
    remaining_amount: int
    tiers: List[WaterfallTierResponse]
    payouts_by_wallet: dict


class SimulatedRoundRequest(BaseModel):
    """A hypothetical funding round for dilution simulation"""
    name: str
    pre_money_valuation: int  # In cents
    amount_raised: int  # In cents


class DilutionRequest(BaseModel):
    """Request to simulate dilution"""
    rounds: List[SimulatedRoundRequest]


class DilutedPositionResponse(BaseModel):
    """A holder's position after dilution"""
    wallet: str
    shares_before: int
    shares_after: int
    ownership_before: float
    ownership_after: float
    dilution_pct: float
    value_before: int
    value_after: int


class NewInvestorResponse(BaseModel):
    """New investor position from simulated round"""
    round_name: str
    amount_invested: int
    shares_received: int
    ownership_pct: float
    price_per_share: int


class DilutionResponse(BaseModel):
    """Complete dilution simulation result"""
    rounds: List[dict]
    before: dict
    after: dict
    existing_holders: List[DilutedPositionResponse]
    new_investors: List[NewInvestorResponse]
