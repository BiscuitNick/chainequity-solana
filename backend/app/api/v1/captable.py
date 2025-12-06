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
)
from app.services.solana_client import get_solana_client

router = APIRouter()


async def _build_captable(
    token_id: int,
    db: AsyncSession,
    slot: Optional[int] = None
) -> CapTableResponse:
    """Build cap-table from current balances or snapshot"""
    # Get token info
    result = await db.execute(
        select(Token).where(Token.id == token_id)
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

        # Get all current balances
        result = await db.execute(
            select(CurrentBalance)
            .where(CurrentBalance.token_id == token_id)
            .where(CurrentBalance.balance > 0)
            .order_by(CurrentBalance.balance.desc())
        )
        balances = result.scalars().all()

        # Get vesting info for each holder
        vesting_map = {}
        result = await db.execute(
            select(VestingSchedule).where(
                VestingSchedule.token_id == token_id,
                VestingSchedule.is_terminated == False
            )
        )
        vesting_schedules = result.scalars().all()
        for vs in vesting_schedules:
            if vs.beneficiary not in vesting_map:
                vesting_map[vs.beneficiary] = {"vested": 0, "unvested": 0}
            vested = vs.calculate_vested(datetime.utcnow())
            unvested = vs.total_amount - vested
            vesting_map[vs.beneficiary]["vested"] += vested
            vesting_map[vs.beneficiary]["unvested"] += unvested

        # Get wallet info (lockouts, limits, status)
        wallet_map = {}
        result = await db.execute(
            select(Wallet).where(Wallet.token_id == token_id)
        )
        wallets = result.scalars().all()
        for w in wallets:
            wallet_map[w.address] = w

        # Calculate total supply
        total_supply = sum(b.balance for b in balances)

        # Build holders list
        holders = []
        for b in balances:
            wallet = wallet_map.get(b.wallet)
            vesting = vesting_map.get(b.wallet, {"vested": 0, "unvested": 0})
            ownership_pct = (b.balance / total_supply * 100) if total_supply > 0 else 0

            holders.append(CapTableEntryResponse(
                wallet=b.wallet,
                balance=b.balance,
                ownership_pct=round(ownership_pct, 4),
                vested=vesting["vested"],
                unvested=vesting["unvested"],
                lockout_until=wallet.lockout_until if wallet else None,
                daily_limit=wallet.daily_limit if wallet else None,
                status=wallet.status if wallet else "active",
            ))

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
