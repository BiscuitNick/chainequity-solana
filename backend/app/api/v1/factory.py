"""Factory API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
import secrets

from app.models.database import get_db
from app.models.token import Token, TokenFeatures
from app.schemas.factory import (
    FactoryInfo,
    TokenListResponse,
    TokenDetailResponse,
    CreateTokenRequest,
    CreateTokenResponse,
)
from app.services.solana_client import get_solana_client

router = APIRouter()


@router.get("", response_model=FactoryInfo)
async def get_factory_info(db: AsyncSession = Depends(get_db)):
    """Get factory information"""
    result = await db.execute(select(Token))
    tokens = result.scalars().all()

    return FactoryInfo(
        token_count=len(tokens),
        creation_fee=0,  # Free for demo
        paused=False,
    )


@router.get("/tokens", response_model=List[TokenListResponse])
async def list_tokens(db: AsyncSession = Depends(get_db)):
    """List all tokens created by the factory"""
    result = await db.execute(select(Token).order_by(Token.token_id))
    tokens = result.scalars().all()

    return [
        TokenListResponse(
            token_id=t.token_id,
            symbol=t.symbol,
            name=t.name,
            mint_address=t.mint_address,
            total_supply=t.total_supply,
            is_paused=t.is_paused,
            created_at=t.created_at,
        )
        for t in tokens
    ]


@router.get("/tokens/{token_id}", response_model=TokenDetailResponse)
async def get_token(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get detailed token information"""
    result = await db.execute(select(Token).where(Token.token_id == token_id))
    token = result.scalar_one_or_none()

    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    return TokenDetailResponse(
        token_id=token.token_id,
        on_chain_config=token.on_chain_config,
        mint_address=token.mint_address,
        symbol=token.symbol,
        name=token.name,
        decimals=token.decimals,
        total_supply=token.total_supply,
        features=token.features,
        is_paused=token.is_paused,
        created_at=token.created_at,
    )


@router.post("/tokens", response_model=CreateTokenResponse)
async def create_token(request: CreateTokenRequest, db: AsyncSession = Depends(get_db)):
    """Create a new token"""
    # Validate symbol format (uppercase, alphanumeric, 1-10 chars)
    symbol = request.symbol.upper().strip()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Symbol must be 1-10 characters")
    if not symbol.isalnum():
        raise HTTPException(status_code=400, detail="Symbol must be alphanumeric")

    # Validate name
    name = request.name.strip()
    if not name or len(name) > 50:
        raise HTTPException(status_code=400, detail="Name must be 1-50 characters")

    # Check for duplicate symbol
    existing = await db.execute(
        select(Token).where(func.upper(Token.symbol) == symbol)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"A token with symbol '{symbol}' already exists"
        )

    # Validate decimals
    if request.decimals < 0 or request.decimals > 18:
        raise HTTPException(status_code=400, detail="Decimals must be 0-18")

    # Validate initial supply
    if request.initial_supply <= 0:
        raise HTTPException(status_code=400, detail="Initial supply must be positive")

    # Validate multi-sig configuration
    if request.admin_threshold < 1:
        raise HTTPException(status_code=400, detail="Admin threshold must be at least 1")
    if request.admin_threshold > len(request.admin_signers):
        raise HTTPException(
            status_code=400,
            detail="Admin threshold cannot exceed number of signers"
        )
    if len(request.admin_signers) == 0:
        raise HTTPException(status_code=400, detail="At least one admin signer is required")

    # Validate signer addresses (basic Solana address format check)
    for signer in request.admin_signers:
        if len(signer) < 32 or len(signer) > 44:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid signer address format: {signer}"
            )

    # Get the next token_id
    max_id_result = await db.execute(select(func.max(Token.token_id)))
    max_id = max_id_result.scalar() or -1
    new_token_id = max_id + 1

    # Generate placeholder addresses for demo mode
    # In production, these would come from actual Solana program calls
    solana_client = await get_solana_client()

    # Generate deterministic but unique addresses based on token_id
    # These simulate what would be created on-chain
    import hashlib
    seed = f"token_{new_token_id}_{symbol}_{secrets.token_hex(8)}"
    hash_bytes = hashlib.sha256(seed.encode()).digest()

    # Create base58-like addresses (simplified for demo)
    import base64
    mint_address = base64.b64encode(hash_bytes[:32]).decode()[:44].replace('+', 'A').replace('/', 'B')
    config_address = base64.b64encode(hash_bytes[16:] + hash_bytes[:16]).decode()[:44].replace('+', 'C').replace('/', 'D')

    # Build features dict from request
    features = {
        "vesting_enabled": request.features.vesting_enabled,
        "governance_enabled": request.features.governance_enabled,
        "dividends_enabled": request.features.dividends_enabled,
        "transfer_restrictions_enabled": request.features.transfer_restrictions_enabled,
        "upgradeable": request.features.upgradeable,
        "admin_signers": request.admin_signers,
        "admin_threshold": request.admin_threshold,
    }

    # Calculate total supply with decimals
    total_supply = request.initial_supply * (10 ** request.decimals)

    # Create the token record
    new_token = Token(
        token_id=new_token_id,
        on_chain_config=config_address,
        mint_address=mint_address,
        symbol=symbol,
        name=name,
        decimals=request.decimals,
        total_supply=total_supply,
        features=features,
        is_paused=False,
    )

    db.add(new_token)
    await db.commit()
    await db.refresh(new_token)

    # Generate a placeholder transaction signature
    tx_signature = f"sim_{secrets.token_hex(32)}"

    return CreateTokenResponse(
        token_id=new_token_id,
        mint_address=mint_address,
        transaction_signature=tx_signature,
    )
