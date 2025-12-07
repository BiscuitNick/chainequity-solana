"""Dividend schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DividendRoundResponse(BaseModel):
    id: int
    round_number: int
    payment_token: str
    total_pool: int
    amount_per_share: float
    snapshot_slot: int
    status: str
    created_at: datetime
    distributed_at: Optional[datetime] = None
    total_recipients: int = 0
    total_batches: int = 0
    completed_batches: int = 0
    # Computed fields for compatibility
    total_distributed: int = 0  # Total amount distributed so far
    distribution_count: int = 0  # Number of successful distributions


class CreateDividendRequest(BaseModel):
    payment_token: str
    total_pool: int


class DividendPaymentResponse(BaseModel):
    id: int
    round_id: int
    wallet: str
    shares: int
    amount: int
    status: str
    batch_number: int
    created_at: datetime
    distributed_at: Optional[datetime] = None
    signature: Optional[str] = None
    error_message: Optional[str] = None
    dividend_per_share: float = 0  # Added for display


class DistributionProgressResponse(BaseModel):
    round_id: int
    status: str
    total_recipients: int
    total_batches: int
    completed_batches: int
    successful_payments: int
    failed_payments: int
    pending_payments: int
    total_distributed: int
    total_pool: int


# Legacy alias for backwards compatibility
DividendClaimResponse = DividendPaymentResponse


class UnclaimedDividendsResponse(BaseModel):
    total_unclaimed: int
    rounds: List[DividendRoundResponse]
