"""Token operations API endpoints"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from solders.pubkey import Pubkey

from app.models.database import get_db
from app.models.token import Token
from app.schemas.token import (
    MintRequest, TransferRequest, TokenInfoResponse, BalanceResponse,
    TokenListResponse, TokenHolder
)
from app.services.solana_client import get_solana_client

router = APIRouter()


@router.get("/", response_model=List[TokenListResponse])
async def list_tokens(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List all tokens"""
    result = await db.execute(
        select(Token)
        .order_by(Token.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    tokens = result.scalars().all()
    return [
        TokenListResponse(
            id=t.id,
            token_id=t.token_id,
            mint_address=t.mint_address,
            symbol=t.symbol,
            name=t.name,
            decimals=t.decimals,
            total_supply=t.total_supply,
            is_paused=t.is_paused,
            created_at=t.created_at,
        )
        for t in tokens
    ]


@router.get("/{token_id}/info", response_model=TokenInfoResponse)
async def get_token_info(token_id: int, db: AsyncSession = Depends(get_db)):
    """Get detailed token information"""
    token = await db.get(Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Get on-chain data
    client = await get_solana_client()
    try:
        mint_pubkey = Pubkey.from_string(token.mint_address)
        account_info = await client.get_account_info(mint_pubkey)

        return TokenInfoResponse(
            id=token.id,
            mint_address=token.mint_address,
            symbol=token.symbol,
            name=token.name,
            decimals=token.decimals,
            total_supply=token.total_supply,
            created_at=token.created_at,
            on_chain_exists=account_info is not None,
            features=token.features,
        )
    except Exception as e:
        return TokenInfoResponse(
            id=token.id,
            mint_address=token.mint_address,
            symbol=token.symbol,
            name=token.name,
            decimals=token.decimals,
            total_supply=token.total_supply,
            created_at=token.created_at,
            on_chain_exists=False,
            features=token.features,
            error=str(e),
        )


@router.get("/{token_id}/balance/{address}", response_model=BalanceResponse)
async def get_balance(token_id: int, address: str, db: AsyncSession = Depends(get_db)):
    """Get token balance for a wallet address"""
    token = await db.get(Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    client = await get_solana_client()
    try:
        mint_pubkey = Pubkey.from_string(token.mint_address)
        owner_pubkey = Pubkey.from_string(address)

        # Get token accounts for this owner and mint
        token_accounts = await client.get_token_accounts_by_owner(
            owner_pubkey,
            mint=mint_pubkey,
        )

        if not token_accounts:
            return BalanceResponse(
                address=address,
                token_id=token_id,
                balance=0,
                ui_balance=0.0,
            )

        # Sum balances from all accounts (usually just one)
        total_balance = 0
        for account in token_accounts:
            balance_info = await client.get_token_balance(
                Pubkey.from_string(account["pubkey"])
            )
            total_balance += int(balance_info["amount"])

        ui_balance = total_balance / (10 ** token.decimals)

        return BalanceResponse(
            address=address,
            token_id=token_id,
            balance=total_balance,
            ui_balance=ui_balance,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get balance: {str(e)}")


@router.get("/{token_id}/holders", response_model=List[TokenHolder])
async def get_token_holders(
    token_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get list of token holders with balances"""
    token = await db.get(Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    client = await get_solana_client()
    try:
        # Note: This requires indexing token accounts or using a more efficient method
        # For now, return from indexed data
        from app.models.wallet import Wallet
        result = await db.execute(
            select(Wallet)
            .where(Wallet.token_id == token_id)
            .where(Wallet.balance > 0)
            .order_by(Wallet.balance.desc())
            .offset(skip)
            .limit(limit)
        )
        wallets = result.scalars().all()

        return [
            TokenHolder(
                address=w.address,
                balance=w.balance,
                ui_balance=w.balance / (10 ** token.decimals),
                percentage=w.balance / token.total_supply * 100 if token.total_supply > 0 else 0,
            )
            for w in wallets
        ]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get holders: {str(e)}")


@router.post("/{token_id}/mint")
async def mint_tokens(token_id: int, request: MintRequest, db: AsyncSession = Depends(get_db)):
    """
    Mint tokens to an approved wallet.

    Note: This endpoint returns transaction data that must be signed
    by the token authority wallet on the client side.
    """
    token = await db.get(Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate recipient is on allowlist
    from app.models.wallet import AllowlistEntry
    entry = await db.execute(
        select(AllowlistEntry)
        .where(AllowlistEntry.token_config == token.config_address)
        .where(AllowlistEntry.wallet_address == request.recipient)
        .where(AllowlistEntry.status == "active")
    )
    if not entry.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Recipient not on allowlist")

    # Return transaction data for client-side signing
    return {
        "message": "Transaction must be signed client-side",
        "instruction_data": {
            "program": "chainequity_token",
            "instruction": "mint",
            "accounts": {
                "mint": token.mint_address,
                "recipient": request.recipient,
            },
            "args": {
                "amount": request.amount,
            },
        },
    }


@router.post("/{token_id}/transfer")
async def transfer_tokens(token_id: int, request: TransferRequest, db: AsyncSession = Depends(get_db)):
    """
    Transfer tokens between approved wallets.

    Note: This endpoint returns transaction data that must be signed
    by the sender wallet on the client side.
    """
    token = await db.get(Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate both sender and recipient are on allowlist
    from app.models.wallet import AllowlistEntry

    for address in [request.sender, request.recipient]:
        entry = await db.execute(
            select(AllowlistEntry)
            .where(AllowlistEntry.token_config == token.config_address)
            .where(AllowlistEntry.wallet_address == address)
            .where(AllowlistEntry.status == "active")
        )
        if not entry.scalar_one_or_none():
            raise HTTPException(
                status_code=403,
                detail=f"Address {address[:16]}... not on allowlist"
            )

    # Return transaction data for client-side signing
    return {
        "message": "Transaction must be signed client-side",
        "instruction_data": {
            "program": "chainequity_token",
            "instruction": "transfer_tokens",
            "accounts": {
                "mint": token.mint_address,
                "from": request.sender,
                "to": request.recipient,
            },
            "args": {
                "amount": request.amount,
            },
        },
    }
