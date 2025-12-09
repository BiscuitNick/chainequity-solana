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
from app.services.solana_client import get_solana_client

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

    # Get all share classes for this token
    result = await db.execute(
        select(ShareClass)
        .where(ShareClass.token_id == token_id)
        .order_by(ShareClass.priority)
    )
    share_classes = result.scalars().all()

    # Get all share positions
    result = await db.execute(
        select(SharePosition)
        .where(SharePosition.token_id == token_id)
        .where(SharePosition.shares > 0)
    )
    positions = result.scalars().all()

    # Calculate totals
    total_shares = sum(p.shares for p in positions)
    total_cost_basis = sum(p.cost_basis for p in positions)
    price_per_share = current_valuation // total_shares if total_shares > 0 else 0
    total_current_value = total_shares * price_per_share

    # Build share class map for lookup
    share_class_map = {sc.id: sc for sc in share_classes}

    # Build share class summaries
    class_summaries = []
    for sc in share_classes:
        class_positions = [p for p in positions if p.share_class_id == sc.id]
        class_shares = sum(p.shares for p in class_positions)
        class_value = class_shares * price_per_share
        class_summaries.append(ShareClassSummary(
            id=sc.id,
            name=sc.name,
            symbol=sc.symbol,
            priority=sc.priority,
            preference_multiple=sc.preference_multiple,
            total_shares=class_shares,
            total_value=class_value,
            holder_count=len(set(p.wallet for p in class_positions)),
        ))

    # Calculate shares per class for class ownership calculation
    shares_per_class = {}
    for p in positions:
        if p.share_class_id not in shares_per_class:
            shares_per_class[p.share_class_id] = 0
        shares_per_class[p.share_class_id] += p.shares

    # Build position entries
    position_entries = []
    unique_wallets = set()
    for p in positions:
        sc = share_class_map.get(p.share_class_id)
        if not sc:
            continue

        unique_wallets.add(p.wallet)
        current_value = p.shares * price_per_share
        class_shares = shares_per_class.get(p.share_class_id, 1)

        position_entries.append(EnhancedCapTableEntry(
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

    # Sort by ownership descending
    position_entries.sort(key=lambda x: x.shares, reverse=True)

    return EnhancedCapTableResponse(
        slot=current_slot,
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
