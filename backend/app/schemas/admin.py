"""Admin schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Any, Optional


class MultisigConfigResponse(BaseModel):
    signers: List[str]
    threshold: int
    nonce: int


class PendingTransactionResponse(BaseModel):
    id: str
    instruction_type: str
    instruction_data: Dict[str, Any]
    signers_approved: List[str]
    signers_pending: List[str]
    created_at: datetime
    expires_at: Optional[datetime] = None


class CorporateActionRequest(BaseModel):
    action_type: str  # 'split' or 'symbol'
    params: Dict[str, Any]  # e.g., {"ratio": 7} or {"new_symbol": "NEWT"}


class ExecuteSplitRequest(BaseModel):
    numerator: int  # e.g., 2 for a 2:1 split
    denominator: int = 1  # Usually 1 for forward splits


class ChangeSymbolRequest(BaseModel):
    new_symbol: str


class UpdateThresholdRequest(BaseModel):
    threshold: int


class PauseRequest(BaseModel):
    paused: bool
