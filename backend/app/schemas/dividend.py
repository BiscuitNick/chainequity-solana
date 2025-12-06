"""Dividend schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DividendRoundResponse(BaseModel):
    id: int
    round_number: int
    payment_token: str
    total_pool: int
    amount_per_share: int
    snapshot_slot: int
    status: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    total_claimed: int = 0
    claim_count: int = 0


class CreateDividendRequest(BaseModel):
    payment_token: str
    total_pool: int
    expires_in_seconds: Optional[int] = None


class DividendClaimResponse(BaseModel):
    round_id: int
    wallet: str
    amount: int
    claimed_at: datetime


class UnclaimedDividendsResponse(BaseModel):
    total_unclaimed: int
    rounds: List[DividendRoundResponse]
