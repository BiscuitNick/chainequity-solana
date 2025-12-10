"""Share Classes API endpoints"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.token import Token
from app.models.share_class import ShareClass, SharePosition, ShareGrant
from app.models.wallet import Wallet
from app.services.history import HistoryService
from app.services.transaction_service import TransactionService
from app.models.unified_transaction import TransactionType
import structlog

logger = structlog.get_logger()
from app.schemas.investment import (
    CreateShareClassRequest,
    ShareClassResponse,
    SharePositionResponse,
    IssueSharesRequest,
    IssueSharesResponse,
)

router = APIRouter()


def _build_share_class_response(sc: ShareClass) -> ShareClassResponse:
    """Convert ShareClass model to response schema"""
    return ShareClassResponse(
        id=sc.id,
        name=sc.name,
        symbol=sc.symbol,
        priority=sc.priority,
        preference_multiple=sc.preference_multiple,
        is_convertible=sc.is_convertible,
        votes_per_share=sc.votes_per_share,
        created_at=sc.created_at,
    )


@router.post("", response_model=ShareClassResponse)
async def create_share_class(
    request: CreateShareClassRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new share class for a token.

    Share classes define:
    - Priority: Lower number = higher priority in liquidation (0 = debt, 99 = common)
    - Preference Multiple: How much the investor must receive before lower tiers (1x, 2x, etc.)
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate symbol
    symbol = request.symbol.upper().strip()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Symbol must be 1-10 characters")

    # Check for duplicate symbol
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.symbol == symbol
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Share class with symbol '{symbol}' already exists")

    # Validate preference multiple
    if request.preference_multiple < 0:
        raise HTTPException(status_code=400, detail="Preference multiple must be non-negative")

    # Validate priority
    if request.priority < 0:
        raise HTTPException(status_code=400, detail="Priority must be non-negative")

    share_class = ShareClass(
        token_id=token_id,
        name=request.name.strip(),
        symbol=symbol,
        priority=request.priority,
        preference_multiple=request.preference_multiple,
    )
    db.add(share_class)
    await db.commit()
    await db.refresh(share_class)

    return _build_share_class_response(share_class)


@router.get("", response_model=List[ShareClassResponse])
async def list_share_classes(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    List all share classes for a token.

    Ordered by priority (highest priority first), then by name.
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    result = await db.execute(
        select(ShareClass)
        .where(ShareClass.token_id == token_id)
        .order_by(ShareClass.priority, ShareClass.name)
    )
    share_classes = result.scalars().all()

    return [_build_share_class_response(sc) for sc in share_classes]


@router.get("/{share_class_id}", response_model=ShareClassResponse)
async def get_share_class(
    token_id: int = Path(...),
    share_class_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific share class by ID"""
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.id == share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    return _build_share_class_response(share_class)


@router.get("/{share_class_id}/positions", response_model=List[SharePositionResponse])
async def get_share_class_positions(
    token_id: int = Path(...),
    share_class_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all positions in a share class.

    Returns all wallets that hold shares in this class, ordered by share count.
    Uses transaction-based state reconstruction for consistency.
    """
    from app.services.solana_client import get_solana_client

    # Get share class with token
    result = await db.execute(
        select(ShareClass)
        .options(selectinload(ShareClass.token))
        .where(
            ShareClass.token_id == token_id,
            ShareClass.id == share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    # Get current slot and reconstruct state from transactions
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    tx_service = TransactionService(db)
    state = await tx_service.reconstruct_at_slot(token_id, current_slot)

    current_price = share_class.token.current_price_per_share or 0

    # Build positions from reconstructed state
    positions = []
    for (wallet, class_id), pos_state in state.positions.items():
        if class_id == share_class_id and pos_state.shares > 0:
            positions.append(SharePositionResponse(
                wallet=wallet,
                share_class=_build_share_class_response(share_class),
                shares=pos_state.shares,
                cost_basis=pos_state.cost_basis,
                price_per_share=pos_state.cost_basis // pos_state.shares if pos_state.shares > 0 else 0,
                current_value=pos_state.shares * current_price,
                preference_amount=int(pos_state.cost_basis * share_class.preference_multiple),
            ))

    # Sort by shares descending
    positions.sort(key=lambda p: p.shares, reverse=True)

    return positions


@router.put("/{share_class_id}", response_model=ShareClassResponse)
async def update_share_class(
    request: CreateShareClassRequest,
    token_id: int = Path(...),
    share_class_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Update a share class.

    Note: Changing priority or preference multiple affects waterfall calculations.
    """
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.id == share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    # Validate symbol
    symbol = request.symbol.upper().strip()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Symbol must be 1-10 characters")

    # Check for duplicate symbol (excluding self)
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.symbol == symbol,
            ShareClass.id != share_class_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Share class with symbol '{symbol}' already exists")

    # Validate preference multiple
    if request.preference_multiple < 0:
        raise HTTPException(status_code=400, detail="Preference multiple must be non-negative")

    # Validate priority
    if request.priority < 0:
        raise HTTPException(status_code=400, detail="Priority must be non-negative")

    share_class.name = request.name.strip()
    share_class.symbol = symbol
    share_class.priority = request.priority
    share_class.preference_multiple = request.preference_multiple
    share_class.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(share_class)

    return _build_share_class_response(share_class)


@router.delete("/{share_class_id}")
async def delete_share_class(
    token_id: int = Path(...),
    share_class_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a share class.

    Only allowed if no shares have been issued for this class.
    """
    # Get share class
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.id == share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    # Check if any positions exist
    result = await db.execute(
        select(SharePosition).where(SharePosition.share_class_id == share_class_id)
    )
    positions = result.scalars().all()
    if positions:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete share class with existing positions"
        )

    await db.delete(share_class)
    await db.commit()

    return {"message": f"Share class '{share_class.symbol}' deleted successfully"}


@router.get("/positions/recent", response_model=List[SharePositionResponse])
async def get_recent_share_positions(
    token_id: int = Path(...),
    limit: int = 10,
    max_slot: int = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent share grant transactions for a token.

    Returns individual grant transactions (not aggregated positions),
    ordered by most recently created. Useful for activity feeds.

    If max_slot is provided, only returns grants with slot <= max_slot.
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Build query for share grants
    query = select(ShareGrant).options(selectinload(ShareGrant.share_class)).where(ShareGrant.token_id == token_id)

    # Filter by max_slot if provided
    if max_slot is not None:
        query = query.where(ShareGrant.slot <= max_slot)

    query = query.order_by(ShareGrant.created_at.desc()).limit(limit)

    result = await db.execute(query)
    grants = result.scalars().all()

    current_price = token.current_price_per_share or 0

    return [
        SharePositionResponse(
            id=g.id,
            wallet=g.wallet,
            share_class=_build_share_class_response(g.share_class) if g.share_class else None,
            shares=g.shares,
            cost_basis=g.cost_basis,
            price_per_share=g.price_per_share,
            current_value=g.shares * current_price,
            preference_amount=int(g.cost_basis * g.share_class.preference_multiple) if g.share_class else g.cost_basis,
            slot=g.slot,
            acquired_at=g.created_at,
        )
        for g in grants
    ]


@router.post("/issue", response_model=IssueSharesResponse)
async def issue_shares(
    request: IssueSharesRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Issue shares to a wallet with a specific share class.

    This creates a SharePosition record tracking:
    - The share class (with its priority and preference multiple)
    - Number of shares issued
    - Cost basis (what was paid, 0 for grants)
    - Price per share at issuance
    - Current Solana slot for historical tracking

    Use this for:
    - Founder share grants (cost_basis = 0)
    - Direct share purchases
    - Employee equity grants
    - Converting investments to shares
    """
    from app.services.solana_client import get_solana_client

    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Verify share class exists
    result = await db.execute(
        select(ShareClass).where(
            ShareClass.token_id == token_id,
            ShareClass.id == request.share_class_id
        )
    )
    share_class = result.scalar_one_or_none()
    if not share_class:
        raise HTTPException(status_code=404, detail="Share class not found")

    # Validate shares
    if request.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive")

    # Validate recipient is on allowlist with active status
    result = await db.execute(
        select(Wallet).where(
            Wallet.token_id == token_id,
            Wallet.address == request.recipient_wallet
        )
    )
    wallet_entry = result.scalar_one_or_none()
    if not wallet_entry:
        raise HTTPException(
            status_code=400,
            detail=f"Wallet {request.recipient_wallet} is not on the allowlist. Add and approve the wallet first."
        )
    if wallet_entry.status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Wallet {request.recipient_wallet} is on the allowlist but not approved (status: {wallet_entry.status})"
        )

    # Get current Solana slot for historical tracking
    try:
        solana_client = await get_solana_client()
        current_slot = await solana_client.get_slot()
    except Exception:
        current_slot = None

    # Check if position already exists for this wallet + share class
    result = await db.execute(
        select(SharePosition).where(
            SharePosition.token_id == token_id,
            SharePosition.wallet == request.recipient_wallet,
            SharePosition.share_class_id == request.share_class_id
        )
    )
    existing_position = result.scalar_one_or_none()

    if existing_position:
        # Update existing position (aggregate balance)
        existing_position.shares += request.shares
        existing_position.cost_basis += request.cost_basis
        # Recalculate average price per share
        if existing_position.shares > 0:
            existing_position.price_per_share = existing_position.cost_basis // existing_position.shares
        existing_position.slot = current_slot  # Update slot to latest change
        existing_position.updated_at = datetime.utcnow()
        position = existing_position
    else:
        # Create new position
        position = SharePosition(
            token_id=token_id,
            wallet=request.recipient_wallet,
            share_class_id=request.share_class_id,
            shares=request.shares,
            cost_basis=request.cost_basis,
            price_per_share=request.price_per_share or (request.cost_basis // request.shares if request.shares > 0 else 0),
            slot=current_slot,
        )
        db.add(position)

    # Create a ShareGrant record for this individual transaction
    grant = ShareGrant(
        token_id=token_id,
        share_class_id=request.share_class_id,
        wallet=request.recipient_wallet,
        shares=request.shares,
        cost_basis=request.cost_basis,
        price_per_share=request.price_per_share or (request.cost_basis // request.shares if request.shares > 0 else 0),
        notes=request.notes,
        slot=current_slot,
        status="completed",
    )
    db.add(grant)
    await db.flush()  # Get grant.id

    # Record SHARE_GRANT transaction to unified log
    tx_service = TransactionService(db)
    await tx_service.record(
        token_id=token_id,
        tx_type=TransactionType.SHARE_GRANT,
        slot=current_slot,
        wallet=request.recipient_wallet,
        amount=request.shares,
        amount_secondary=request.cost_basis,
        share_class_id=request.share_class_id,
        priority=share_class.priority,
        preference_multiple=share_class.preference_multiple,
        price_per_share=request.price_per_share or (request.cost_basis // request.shares if request.shares > 0 else 0),
        reference_id=grant.id,
        reference_type="share_grant",
        triggered_by="api:issue_shares",
        notes=request.notes,
    )

    # Update token total supply (all share issuances increase supply)
    token.total_supply = (token.total_supply or 0) + request.shares

    await db.commit()
    await db.refresh(position)
    await db.refresh(grant)

    return IssueSharesResponse(
        id=position.id,
        recipient_wallet=position.wallet,
        share_class=_build_share_class_response(share_class),
        shares=request.shares,  # Return the newly issued amount, not the total
        cost_basis=request.cost_basis,
        price_per_share=request.price_per_share,
        notes=request.notes,
        created_at=position.acquired_at,
    )
