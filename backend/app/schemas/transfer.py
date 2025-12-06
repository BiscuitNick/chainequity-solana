"""Transfer schemas"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TransferResponse(BaseModel):
    """Response for a single transfer"""
    id: int
    signature: str
    from_wallet: str
    to_wallet: str
    amount: int
    slot: int
    block_time: datetime
    status: str
    failure_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TransferListResponse(BaseModel):
    """Response for transfer list with pagination"""
    transfers: list[TransferResponse]
    total: int
    skip: int
    limit: int


class TransferStatsResponse(BaseModel):
    """Response for transfer statistics"""
    total_transfers: int
    transfers_24h: int
    volume_24h: int
