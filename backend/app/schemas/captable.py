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
