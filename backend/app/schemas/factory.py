"""Factory schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class FactoryInfo(BaseModel):
    token_count: int
    creation_fee: int
    paused: bool


class TokenListResponse(BaseModel):
    token_id: int
    symbol: str
    name: str
    mint_address: str
    total_supply: int
    is_paused: bool
    created_at: datetime


class TokenDetailResponse(BaseModel):
    token_id: int
    on_chain_config: str
    mint_address: str
    symbol: str
    name: str
    decimals: int
    total_supply: int
    features: Dict[str, Any]
    is_paused: bool
    created_at: datetime


class TokenFeaturesRequest(BaseModel):
    vesting_enabled: bool = True
    governance_enabled: bool = True
    dividends_enabled: bool = True
    transfer_restrictions_enabled: bool = True
    upgradeable: bool = True


class CreateTokenRequest(BaseModel):
    symbol: str
    name: str
    decimals: int = 0
    initial_supply: int
    features: TokenFeaturesRequest
    admin_signers: List[str]
    admin_threshold: int
    template_id: Optional[int] = None


class CreateTokenResponse(BaseModel):
    token_id: int
    mint_address: str
    transaction_signature: str
