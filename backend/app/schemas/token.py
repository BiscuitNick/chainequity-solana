"""Token operation schemas"""
from pydantic import BaseModel
from typing import Optional


class MintRequest(BaseModel):
    recipient: str
    amount: int


class TransferRequest(BaseModel):
    to: str
    amount: int


class TokenInfoResponse(BaseModel):
    token_id: int
    symbol: str
    name: str
    total_supply: int
    holder_count: int
    transfer_count_24h: int


class BalanceResponse(BaseModel):
    wallet: str
    balance: int
    vested_balance: int
    available_balance: int
