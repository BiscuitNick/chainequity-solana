"""Factory API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.models.database import get_db
from app.models.token import Token
from app.schemas.factory import (
    FactoryInfo,
    TokenListResponse,
    TokenDetailResponse,
    CreateTokenRequest,
    CreateTokenResponse,
)

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
    """Create a new token (submits to Solana)"""
    # This would call the Solana program via anchorpy
    # For now, return a placeholder response
    raise HTTPException(
        status_code=501,
        detail="Token creation requires Solana program interaction. Use the frontend."
    )
