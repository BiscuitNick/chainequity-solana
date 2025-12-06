"""Allowlist schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class AllowlistEntryResponse(BaseModel):
    address: str
    status: str
    kyc_level: int
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None


class ApproveWalletRequest(BaseModel):
    wallet: str
    kyc_level: int = 1


class BulkApproveRequest(BaseModel):
    wallets: List[ApproveWalletRequest]
