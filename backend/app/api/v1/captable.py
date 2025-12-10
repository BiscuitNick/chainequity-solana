"""Cap-table API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime
import io
import csv
import json

from app.models.database import get_db
from app.models.token import Token
from app.models.wallet import Wallet
from app.models.vesting import VestingSchedule
from app.models.snapshot import CapTableSnapshot, CurrentBalance
from app.schemas.captable import (
    CapTableResponse,
    CapTableEntryResponse,
    ExportFormat,
    SnapshotResponse,
    EnhancedCapTableResponse,
    EnhancedCapTableEntry,
    EnhancedCapTableByWalletResponse,
    ShareClassSummary,
    WalletSummary,
)
from app.models.share_class import ShareClass, SharePosition
from app.models.unified_transaction import UnifiedTransaction, TransactionType
from app.services.solana_client import get_solana_client
from app.services.transaction_service import TransactionService, TokenState

router = APIRouter()


async def _update_balance(db: AsyncSession, token_id: int, wallet: str, amount: int):
    """Update or create a balance record for a wallet"""
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == wallet
        )
    )
    balance = result.scalar_one_or_none()

    if balance:
        balance.balance += amount
        balance.last_updated_slot = 0
        balance.updated_at = datetime.utcnow()
    else:
        balance = CurrentBalance(
            token_id=token_id,
            wallet=wallet,
            balance=amount,
            last_updated_slot=0,
        )
        db.add(balance)


async def _auto_release_vested(db: AsyncSession, token_id: int, schedule: VestingSchedule):
    """Auto-release any newly vested tokens to the beneficiary's balance"""
    now = datetime.utcnow()
    vested = schedule.calculate_vested(now)
    releasable = vested - schedule.released_amount

    if releasable > 0:
        # Update released amount
        schedule.released_amount = vested
        # Credit to beneficiary's cap table balance
        await _update_balance(db, token_id, schedule.beneficiary, releasable)


async def _build_captable(
    token_id: int,
    db: AsyncSession,
    slot: Optional[int] = None
) -> CapTableResponse:
    """Build cap-table from current balances or snapshot"""
    # Get token info - token_id in URL is the business token_id, not the internal id
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    if slot:
        # Get from snapshot
        result = await db.execute(
            select(CapTableSnapshot).where(
                CapTableSnapshot.token_id == token_id,
                CapTableSnapshot.slot == slot
            )
        )
        snapshot = result.scalar_one_or_none()
        if not snapshot:
            raise HTTPException(status_code=404, detail=f"No snapshot found for slot {slot}")

        # Parse snapshot data
        holders = []
        for entry in snapshot.snapshot_data.get("holders", []):
            holders.append(CapTableEntryResponse(
                wallet=entry["wallet"],
                balance=entry["balance"],
                ownership_pct=entry["ownership_pct"],
                vested=entry.get("vested", 0),
                unvested=entry.get("unvested", 0),
                lockout_until=entry.get("lockout_until"),
                daily_limit=entry.get("daily_limit"),
                status=entry.get("status", "active"),
            ))

        return CapTableResponse(
            slot=snapshot.slot,
            timestamp=snapshot.block_time,
            total_supply=snapshot.total_supply,
            holder_count=snapshot.holder_count,
            holders=holders,
        )
    else:
        # Get current state
        solana_client = await get_solana_client()
        current_slot = await solana_client.get_slot()

        # Get all current balances (on-chain)
        result = await db.execute(
            select(CurrentBalance)
            .where(CurrentBalance.token_id == token_id)
            .where(CurrentBalance.balance > 0)
            .order_by(CurrentBalance.balance.desc())
        )
        balances = result.scalars().all()

        # Get all share positions (off-chain issuances)
        result = await db.execute(
            select(SharePosition)
            .where(SharePosition.token_id == token_id)
            .where(SharePosition.shares > 0)
        )
        share_positions = result.scalars().all()

        # Get vesting info for each holder and auto-release vested tokens
        vesting_map = {}
        result = await db.execute(
            select(VestingSchedule).where(
                VestingSchedule.token_id == token_id,
                VestingSchedule.termination_type.is_(None)  # Not terminated
            )
        )
        vesting_schedules = result.scalars().all()

        # Auto-release vested tokens for all active schedules
        for vs in vesting_schedules:
            await _auto_release_vested(db, token_id, vs)

        # Commit the auto-release updates before building the response
        await db.commit()

        # Re-fetch balances after auto-release to get updated values
        result = await db.execute(
            select(CurrentBalance)
            .where(CurrentBalance.token_id == token_id)
            .where(CurrentBalance.balance > 0)
            .order_by(CurrentBalance.balance.desc())
        )
        balances = result.scalars().all()

        # Build vesting map for display
        for vs in vesting_schedules:
            if vs.beneficiary not in vesting_map:
                vesting_map[vs.beneficiary] = {"vested": 0, "unvested": 0}
            vested = vs.calculate_vested(datetime.utcnow())
            unvested = vs.total_amount - vested
            vesting_map[vs.beneficiary]["vested"] += vested
            vesting_map[vs.beneficiary]["unvested"] += unvested

        # Get wallet info (status) and restrictions (lockouts, limits)
        wallet_map = {}
        result = await db.execute(
            select(Wallet).where(Wallet.token_id == token_id)
        )
        wallets = result.scalars().all()
        for w in wallets:
            wallet_map[w.address] = w

        # Merge on-chain balances with off-chain share positions
        # Create a combined map: wallet -> total balance
        combined_balances = {}

        # Add on-chain balances
        for b in balances:
            if b.wallet not in combined_balances:
                combined_balances[b.wallet] = 0
            combined_balances[b.wallet] += b.balance

        # Add off-chain share positions
        for sp in share_positions:
            if sp.wallet not in combined_balances:
                combined_balances[sp.wallet] = 0
            combined_balances[sp.wallet] += sp.shares

        # Calculate total supply (combined)
        total_supply = sum(combined_balances.values())

        # Build holders list
        holders = []
        for wallet_addr, balance in combined_balances.items():
            wallet = wallet_map.get(wallet_addr)
            vesting = vesting_map.get(wallet_addr, {"vested": 0, "unvested": 0})
            ownership_pct = (balance / total_supply * 100) if total_supply > 0 else 0

            holders.append(CapTableEntryResponse(
                wallet=wallet_addr,
                balance=balance,
                ownership_pct=round(ownership_pct, 4),
                vested=vesting["vested"],
                unvested=vesting["unvested"],
                lockout_until=None,  # TODO: eager load restrictions
                daily_limit=None,    # TODO: eager load restrictions
                status=wallet.status if wallet else "active",
            ))

        # Sort by balance descending
        holders.sort(key=lambda x: x.balance, reverse=True)

        return CapTableResponse(
            slot=current_slot,
            timestamp=datetime.utcnow(),
            total_supply=total_supply,
            holder_count=len(holders),
            holders=holders,
        )


@router.get("", response_model=CapTableResponse)
async def get_captable(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Get current cap-table"""
    return await _build_captable(token_id, db)


@router.get("/at/{slot}", response_model=CapTableResponse)
async def get_captable_at_slot(token_id: int = Path(...), slot: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Get cap-table at a specific slot"""
    return await _build_captable(token_id, db, slot)


@router.get("/snapshots", response_model=List[SnapshotResponse])
async def list_snapshots(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """List available cap-table snapshots"""
    result = await db.execute(
        select(CapTableSnapshot)
        .where(CapTableSnapshot.token_id == token_id)
        .order_by(CapTableSnapshot.slot.desc())
        .limit(100)
    )
    snapshots = result.scalars().all()

    return [
        SnapshotResponse(
            slot=s.slot,
            timestamp=s.block_time,
            holder_count=s.holder_count,
        )
        for s in snapshots
    ]


@router.get("/export")
async def export_captable(
    token_id: int = Path(...),
    format: ExportFormat = ExportFormat.CSV,
    slot: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Export cap-table as CSV, JSON, or PDF"""
    captable = await _build_captable(token_id, db, slot)

    if format == ExportFormat.CSV:
        # Build CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Wallet", "Balance", "Ownership %", "Vested", "Unvested",
            "Lockout Until", "Daily Limit", "Status"
        ])
        for h in captable.holders:
            writer.writerow([
                h.wallet,
                h.balance,
                h.ownership_pct,
                h.vested,
                h.unvested,
                h.lockout_until.isoformat() if h.lockout_until else "",
                h.daily_limit or "",
                h.status,
            ])

        content = output.getvalue()
        return StreamingResponse(
            io.BytesIO(content.encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=captable_slot_{captable.slot}.csv"
            }
        )

    elif format == ExportFormat.JSON:
        # Build JSON
        data = {
            "slot": captable.slot,
            "timestamp": captable.timestamp.isoformat(),
            "total_supply": captable.total_supply,
            "holder_count": captable.holder_count,
            "holders": [
                {
                    "wallet": h.wallet,
                    "balance": h.balance,
                    "ownership_pct": h.ownership_pct,
                    "vested": h.vested,
                    "unvested": h.unvested,
                    "lockout_until": h.lockout_until.isoformat() if h.lockout_until else None,
                    "daily_limit": h.daily_limit,
                    "status": h.status,
                }
                for h in captable.holders
            ]
        }

        content = json.dumps(data, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode('utf-8')),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=captable_slot_{captable.slot}.json"
            }
        )

    elif format == ExportFormat.PDF:
        # PDF generation requires additional libraries
        # For this phase, return a simple text-based report
        lines = [
            f"Cap Table Report",
            f"================",
            f"",
            f"Slot: {captable.slot}",
            f"Timestamp: {captable.timestamp.isoformat()}",
            f"Total Supply: {captable.total_supply}",
            f"Holder Count: {captable.holder_count}",
            f"",
            f"Holders:",
            f"---------",
        ]
        for h in captable.holders:
            lines.append(f"  {h.wallet}: {h.balance} ({h.ownership_pct}%)")

        content = "\n".join(lines)
        return StreamingResponse(
            io.BytesIO(content.encode('utf-8')),
            media_type="text/plain",
            headers={
                "Content-Disposition": f"attachment; filename=captable_slot_{captable.slot}.txt"
            }
        )

    raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")


@router.get("/enhanced", response_model=EnhancedCapTableResponse)
async def get_enhanced_captable(
    token_id: int = Path(...),
    slot: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get enhanced cap table with dollar values and share class breakdown.

    This endpoint provides:
    - Current valuation and price per share
    - Total cost basis (amount invested)
    - Current value at today's valuation
    - Unrealized gains/losses
    - Share class breakdown with priorities and preference multiples
    - Individual positions with full investment details

    Args:
        slot: Optional historical slot to reconstruct state at. If not provided, returns current state.
    """
    # Get token info with valuation
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Valuation is optional - if not set, we'll just show shares without dollar values
    current_valuation = token.current_valuation or 0

    # Get current slot
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    # Get all share classes for this token (these don't change historically for now)
    result = await db.execute(
        select(ShareClass)
        .where(ShareClass.token_id == token_id)
        .order_by(ShareClass.priority)
    )
    share_classes = result.scalars().all()
    share_class_map = {sc.id: sc for sc in share_classes}

    # Determine if we need historical reconstruction
    target_slot = slot if slot is not None else current_slot
    is_historical = slot is not None

    if is_historical:
        # Reconstruct state from unified transactions
        tx_service = TransactionService(db)
        state = await tx_service.reconstruct_at_slot(token_id, target_slot)

        # Build positions from reconstructed state
        positions_data = []
        for (wallet, class_id), pos_state in state.positions.items():
            if pos_state.shares > 0:
                positions_data.append({
                    'wallet': wallet,
                    'share_class_id': class_id,
                    'shares': pos_state.shares,
                    'cost_basis': pos_state.cost_basis,
                    'priority': pos_state.priority,
                    'preference_multiple': pos_state.preference_multiple,
                })

        total_shares = state.total_supply
    else:
        # Get all share positions from database (current state)
        result = await db.execute(
            select(SharePosition)
            .where(SharePosition.token_id == token_id)
            .where(SharePosition.shares > 0)
        )
        positions = result.scalars().all()

        positions_data = [{
            'wallet': p.wallet,
            'share_class_id': p.share_class_id,
            'shares': p.shares,
            'cost_basis': p.cost_basis,
            'priority': share_class_map.get(p.share_class_id, type('obj', (object,), {'priority': 99})).priority,
            'preference_multiple': share_class_map.get(p.share_class_id, type('obj', (object,), {'preference_multiple': 1.0})).preference_multiple,
        } for p in positions]

        total_shares = sum(p['shares'] for p in positions_data)

    # Calculate totals
    total_cost_basis = sum(p['cost_basis'] for p in positions_data)
    price_per_share = current_valuation // total_shares if total_shares > 0 else 0
    total_current_value = total_shares * price_per_share

    # Build share class summaries
    class_summaries = []
    for sc in share_classes:
        class_positions = [p for p in positions_data if p['share_class_id'] == sc.id]
        class_shares = sum(p['shares'] for p in class_positions)
        class_value = class_shares * price_per_share
        class_summaries.append(ShareClassSummary(
            id=sc.id,
            name=sc.name,
            symbol=sc.symbol,
            priority=sc.priority,
            preference_multiple=sc.preference_multiple,
            total_shares=class_shares,
            total_value=class_value,
            holder_count=len(set(p['wallet'] for p in class_positions)),
        ))

    # Calculate shares per class for class ownership calculation
    shares_per_class = {}
    for p in positions_data:
        if p['share_class_id'] not in shares_per_class:
            shares_per_class[p['share_class_id']] = 0
        shares_per_class[p['share_class_id']] += p['shares']

    # Build position entries
    position_entries = []
    unique_wallets = set()
    for p in positions_data:
        sc = share_class_map.get(p['share_class_id'])
        if not sc:
            continue

        unique_wallets.add(p['wallet'])
        current_value = p['shares'] * price_per_share
        class_shares = shares_per_class.get(p['share_class_id'], 1)

        position_entries.append(EnhancedCapTableEntry(
            wallet=p['wallet'],
            share_class_id=sc.id,
            share_class_name=sc.name,
            share_class_symbol=sc.symbol,
            shares=p['shares'],
            cost_basis=p['cost_basis'],
            current_value=current_value,
            ownership_pct=round((p['shares'] / total_shares * 100), 4) if total_shares > 0 else 0,
            class_ownership_pct=round((p['shares'] / class_shares * 100), 4) if class_shares > 0 else 0,
            unrealized_gain=current_value - p['cost_basis'],
            price_per_share=price_per_share,
            preference_amount=int(p['cost_basis'] * sc.preference_multiple),
        ))

    # Sort by ownership descending
    position_entries.sort(key=lambda x: x.shares, reverse=True)

    return EnhancedCapTableResponse(
        slot=target_slot,
        timestamp=datetime.utcnow(),
        current_valuation=current_valuation,
        price_per_share=price_per_share,
        last_valuation_date=token.last_valuation_date,
        total_shares=total_shares,
        total_cost_basis=total_cost_basis,
        total_current_value=total_current_value,
        holder_count=len(unique_wallets),
        share_classes=class_summaries,
        positions=position_entries,
    )


@router.get("/enhanced/by-wallet", response_model=EnhancedCapTableByWalletResponse)
async def get_enhanced_captable_by_wallet(
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Get enhanced cap table grouped by wallet.

    Each wallet shows all their positions across different share classes
    with aggregated totals.
    """
    # Get token info with valuation
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    current_valuation = token.current_valuation or 0
    if current_valuation <= 0:
        raise HTTPException(
            status_code=400,
            detail="Token has no current valuation. Set a valuation first using POST /valuations."
        )

    # Get current slot
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    # Get all share classes for this token
    result = await db.execute(
        select(ShareClass).where(ShareClass.token_id == token_id)
    )
    share_classes = result.scalars().all()
    share_class_map = {sc.id: sc for sc in share_classes}

    # Get all share positions
    result = await db.execute(
        select(SharePosition)
        .where(SharePosition.token_id == token_id)
        .where(SharePosition.shares > 0)
    )
    positions = result.scalars().all()

    # Calculate totals
    total_shares = sum(p.shares for p in positions)
    price_per_share = current_valuation // total_shares if total_shares > 0 else 0

    # Calculate shares per class for class ownership
    shares_per_class = {}
    for p in positions:
        if p.share_class_id not in shares_per_class:
            shares_per_class[p.share_class_id] = 0
        shares_per_class[p.share_class_id] += p.shares

    # Group positions by wallet
    wallet_positions = {}
    for p in positions:
        if p.wallet not in wallet_positions:
            wallet_positions[p.wallet] = []
        wallet_positions[p.wallet].append(p)

    # Build wallet summaries
    wallet_summaries = []
    for wallet, wallet_pos in wallet_positions.items():
        wallet_shares = sum(p.shares for p in wallet_pos)
        wallet_cost_basis = sum(p.cost_basis for p in wallet_pos)
        wallet_current_value = wallet_shares * price_per_share

        # Build position entries for this wallet
        pos_entries = []
        for p in wallet_pos:
            sc = share_class_map.get(p.share_class_id)
            if not sc:
                continue

            current_value = p.shares * price_per_share
            class_shares = shares_per_class.get(p.share_class_id, 1)

            pos_entries.append(EnhancedCapTableEntry(
                wallet=p.wallet,
                share_class_id=sc.id,
                share_class_name=sc.name,
                share_class_symbol=sc.symbol,
                shares=p.shares,
                cost_basis=p.cost_basis,
                current_value=current_value,
                ownership_pct=round((p.shares / total_shares * 100), 4) if total_shares > 0 else 0,
                class_ownership_pct=round((p.shares / class_shares * 100), 4) if class_shares > 0 else 0,
                unrealized_gain=current_value - p.cost_basis,
                price_per_share=price_per_share,
                preference_amount=int(p.cost_basis * sc.preference_multiple),
            ))

        wallet_summaries.append(WalletSummary(
            wallet=wallet,
            total_shares=wallet_shares,
            total_cost_basis=wallet_cost_basis,
            total_current_value=wallet_current_value,
            total_ownership_pct=round((wallet_shares / total_shares * 100), 4) if total_shares > 0 else 0,
            total_unrealized_gain=wallet_current_value - wallet_cost_basis,
            positions=pos_entries,
        ))

    # Sort by ownership descending
    wallet_summaries.sort(key=lambda x: x.total_shares, reverse=True)

    return EnhancedCapTableByWalletResponse(
        slot=current_slot,
        timestamp=datetime.utcnow(),
        current_valuation=current_valuation,
        price_per_share=price_per_share,
        total_shares=total_shares,
        holder_count=len(wallet_summaries),
        wallets=wallet_summaries,
    )


# ==================== V2 Snapshot Endpoints ====================
# These endpoints use the new CapTableSnapshotV2 system for full historical reconstruction

from app.services.history import HistoryService
from app.models.history import CapTableSnapshotV2
from pydantic import BaseModel


class SnapshotV2Response(BaseModel):
    """Response for V2 snapshot listing."""
    id: int
    slot: int
    timestamp: Optional[datetime]
    total_supply: int
    holder_count: int
    total_shares: int
    trigger: str

    class Config:
        from_attributes = True


class SnapshotV2DetailResponse(BaseModel):
    """Full snapshot detail response."""
    id: int
    slot: int
    timestamp: Optional[datetime]
    total_supply: int
    holder_count: int
    total_shares: int
    trigger: str
    token_state: dict
    holders: List[dict]
    share_positions: List[dict]
    vesting_schedules: List[dict]
    share_classes: List[dict]

    class Config:
        from_attributes = True


class CreateSnapshotRequest(BaseModel):
    """Request to create a manual snapshot."""
    trigger: str = "manual"


@router.post("/snapshots/v2", response_model=SnapshotV2Response)
async def create_snapshot_v2(
    token_id: int = Path(...),
    request: CreateSnapshotRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new V2 snapshot capturing complete state.

    This creates a point-in-time snapshot of all relevant data:
    - Token state (supply, paused status, etc.)
    - All holder balances with wallet status
    - All share positions
    - All vesting schedules with calculated values
    - All share class definitions
    """
    history_service = HistoryService(db)
    trigger = request.trigger if request else "manual"

    snapshot = await history_service.create_snapshot(token_id, trigger=trigger)
    await db.commit()

    return SnapshotV2Response(
        id=snapshot.id,
        slot=snapshot.slot,
        timestamp=snapshot.block_time,
        total_supply=snapshot.total_supply,
        holder_count=snapshot.holder_count,
        total_shares=snapshot.total_shares,
        trigger=snapshot.trigger,
    )


@router.get("/snapshots/v2", response_model=List[SnapshotV2Response])
async def list_snapshots_v2(
    token_id: int = Path(...),
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List available V2 snapshots for a token."""
    history_service = HistoryService(db)
    snapshots = await history_service.list_snapshots(token_id, limit=limit)

    return [
        SnapshotV2Response(
            id=s.id,
            slot=s.slot,
            timestamp=s.block_time,
            total_supply=s.total_supply,
            holder_count=s.holder_count,
            total_shares=s.total_shares,
            trigger=s.trigger,
        )
        for s in snapshots
    ]


@router.get("/snapshots/v2/{slot}", response_model=SnapshotV2DetailResponse)
async def get_snapshot_v2_at_slot(
    token_id: int = Path(...),
    slot: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Get the V2 snapshot at or before a specific slot.

    Returns the most recent snapshot taken at or before the specified slot,
    allowing reconstruction of state at any historical point.
    """
    history_service = HistoryService(db)
    snapshot = await history_service.get_snapshot_at_slot(token_id, slot)

    if not snapshot:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshot found at or before slot {slot}"
        )

    return SnapshotV2DetailResponse(
        id=snapshot.id,
        slot=snapshot.slot,
        timestamp=snapshot.block_time,
        total_supply=snapshot.total_supply,
        holder_count=snapshot.holder_count,
        total_shares=snapshot.total_shares,
        trigger=snapshot.trigger,
        token_state=snapshot.token_state,
        holders=snapshot.holders,
        share_positions=snapshot.share_positions,
        vesting_schedules=snapshot.vesting_schedules,
        share_classes=snapshot.share_classes,
    )


# ============================================================
# Transaction-based State Reconstruction Endpoints
# ============================================================

@router.get("/state/{slot}")
async def get_reconstructed_state_at_slot(
    token_id: int = Path(...),
    slot: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Reconstruct complete token state at any slot by replaying transactions.

    This uses the unified transaction log to replay all events up to the
    specified slot, producing an accurate point-in-time state without
    requiring pre-computed snapshots.

    Returns:
    - approved_wallets: Set of wallets approved at that slot
    - balances: Map of wallet -> total shares
    - positions: List of share positions with share class details
    - vesting_schedules: Active vesting schedules with release amounts
    - total_supply: Total shares outstanding
    - is_paused: Whether the token was paused
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Reconstruct state using transaction service
    tx_service = TransactionService(db)
    state = await tx_service.reconstruct_at_slot(token_id, slot)

    # Convert internal state to API response format
    positions_list = [
        {
            "wallet": pos.wallet,
            "share_class_id": pos.share_class_id,
            "shares": pos.shares,
            "cost_basis": pos.cost_basis,
            "priority": pos.priority,
            "preference_multiple": pos.preference_multiple,
        }
        for pos in state.positions.values()
    ]

    vesting_list = [
        {
            "schedule_id": vs.schedule_id,
            "beneficiary": vs.beneficiary,
            "total_amount": vs.total_amount,
            "released_amount": vs.released_amount,
            "share_class_id": vs.share_class_id,
            "is_terminated": vs.is_terminated,
        }
        for vs in state.vesting_schedules.values()
    ]

    return {
        "slot": slot,
        "token_id": token_id,
        "approved_wallets": list(state.approved_wallets),
        "balances": state.balances,
        "positions": positions_list,
        "vesting_schedules": vesting_list,
        "total_supply": state.total_supply,
        "is_paused": state.is_paused,
        "holder_count": len([w for w, b in state.balances.items() if b > 0]),
    }


@router.get("/activity")
async def get_token_activity(
    token_id: int = Path(...),
    limit: int = 50,
    offset: int = 0,
    tx_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Get transaction activity feed for a token.

    Returns recent transactions from the unified transaction log,
    ordered by slot descending (newest first).

    Args:
        token_id: Token to get activity for
        limit: Maximum records to return (default 50)
        offset: Records to skip for pagination
        tx_type: Optional filter by transaction type (e.g., "approval", "mint")
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    # Parse tx_type filter if provided
    tx_types = None
    if tx_type:
        try:
            tx_types = [TransactionType(tx_type)]
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid transaction type: {tx_type}")

    # Get activity
    tx_service = TransactionService(db)
    transactions = await tx_service.get_activity(
        token_id=token_id,
        limit=limit,
        offset=offset,
        tx_types=tx_types,
    )

    return {
        "transactions": [
            {
                "id": tx.id,
                "slot": tx.slot,
                "block_time": tx.block_time.isoformat() if tx.block_time else None,
                "tx_type": tx.tx_type.value,
                "wallet": tx.wallet,
                "wallet_to": tx.wallet_to,
                "amount": tx.amount,
                "amount_secondary": tx.amount_secondary,
                "share_class_id": tx.share_class_id,
                "priority": tx.priority,
                "preference_multiple": tx.preference_multiple,
                "price_per_share": tx.price_per_share,
                "reference_id": tx.reference_id,
                "reference_type": tx.reference_type,
                "data": tx.data,
                "tx_signature": tx.tx_signature,
                "triggered_by": tx.triggered_by,
                "notes": tx.notes,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            }
            for tx in transactions
        ],
        "limit": limit,
        "offset": offset,
        "count": len(transactions),
    }


@router.get("/activity/wallet/{address}")
async def get_wallet_activity(
    token_id: int = Path(...),
    address: str = Path(...),
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """
    Get transaction activity for a specific wallet.

    Returns all transactions involving this wallet (either as sender
    or recipient), ordered by slot descending.
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Token not found")

    tx_service = TransactionService(db)
    transactions = await tx_service.get_wallet_activity(
        wallet=address,
        token_id=token_id,
        limit=limit,
        offset=offset,
    )

    return {
        "wallet": address,
        "transactions": [
            {
                "id": tx.id,
                "slot": tx.slot,
                "block_time": tx.block_time.isoformat() if tx.block_time else None,
                "tx_type": tx.tx_type.value,
                "wallet": tx.wallet,
                "wallet_to": tx.wallet_to,
                "amount": tx.amount,
                "amount_secondary": tx.amount_secondary,
                "share_class_id": tx.share_class_id,
                "priority": tx.priority,
                "preference_multiple": tx.preference_multiple,
                "price_per_share": tx.price_per_share,
                "reference_id": tx.reference_id,
                "reference_type": tx.reference_type,
                "data": tx.data,
                "tx_signature": tx.tx_signature,
                "triggered_by": tx.triggered_by,
                "notes": tx.notes,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            }
            for tx in transactions
        ],
        "limit": limit,
        "offset": offset,
        "count": len(transactions),
    }
