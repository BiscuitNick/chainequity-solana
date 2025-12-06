"""Token issuance schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class IssueTokensRequest(BaseModel):
    """Request to issue tokens to a wallet"""
    recipient: str
    amount: int
    notes: Optional[str] = None


class BulkIssueTokensRequest(BaseModel):
    """Request to issue tokens to multiple wallets"""
    issuances: List[IssueTokensRequest]


class TokenIssuanceResponse(BaseModel):
    """Response for a token issuance record"""
    id: int
    recipient: str
    amount: int
    issued_by: Optional[str] = None
    notes: Optional[str] = None
    tx_signature: Optional[str] = None
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None


class IssueTokensTransactionResponse(BaseModel):
    """Response with transaction data for client signing"""
    message: str
    issuance_id: int
    recipient: str
    amount: int
    instruction: dict
