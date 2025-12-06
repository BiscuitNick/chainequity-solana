"""Allowlist schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class AllowlistEntryResponse(BaseModel):
    address: str
    status: str
    kyc_level: int
    added_at: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None


class AddWalletRequest(BaseModel):
    """Request to add a wallet to allowlist"""
    address: str
    kyc_level: int = 1


class ApproveWalletRequest(BaseModel):
    """Request to approve a wallet on allowlist"""
    address: str
    kyc_level: int = 1


class BulkApproveRequest(BaseModel):
    """Request to bulk approve wallets"""
    addresses: List[str]
    kyc_level: int = 1
