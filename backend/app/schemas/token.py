"""Token operation schemas"""
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class MintRequest(BaseModel):
    recipient: str
    amount: int


class TransferRequest(BaseModel):
    sender: str
    recipient: str
    amount: int


class TokenListResponse(BaseModel):
    id: int
    mint_address: str
    symbol: str
    name: str
    decimals: int
    total_supply: int
    created_at: datetime


class TokenInfoResponse(BaseModel):
    id: int
    mint_address: str
    symbol: str
    name: str
    decimals: int
    total_supply: int
    created_at: datetime
    on_chain_exists: bool = False
    features: Optional[Dict[str, Any]] = None
    holder_count: Optional[int] = None
    transfer_count_24h: Optional[int] = None
    error: Optional[str] = None


class BalanceResponse(BaseModel):
    address: str
    token_id: int
    balance: int
    ui_balance: float
    vested_balance: Optional[int] = None
    available_balance: Optional[int] = None


class TokenHolder(BaseModel):
    address: str
    balance: int
    ui_balance: float
    percentage: float
