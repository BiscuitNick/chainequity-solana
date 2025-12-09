"""
Historical state tracking service.

This service provides:
1. Recording state changes with slot information
2. Point-in-time state reconstruction
3. Periodic snapshot creation
"""
import json
from datetime import datetime
from typing import Optional, Dict, Any, List, TypeVar, Type
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeMeta
import structlog

from app.models.history import StateChange, ChangeType, CapTableSnapshotV2
from app.models.token import Token
from app.models.wallet import Wallet
from app.models.share_class import ShareClass, SharePosition
from app.models.vesting import VestingSchedule
from app.models.snapshot import CurrentBalance
from app.services.solana_client import get_solana_client

logger = structlog.get_logger()

T = TypeVar('T')


def model_to_dict(obj: Any, exclude: set = None) -> Dict[str, Any]:
    """Convert a SQLAlchemy model to a dictionary, handling datetime serialization."""
    if obj is None:
        return None

    exclude = exclude or set()
    result = {}

    for column in obj.__table__.columns:
        if column.name in exclude:
            continue
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        result[column.name] = value

    return result


class HistoryService:
    """Service for tracking and querying historical state."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._current_slot: Optional[int] = None
        self._current_block_time: Optional[datetime] = None

    async def get_current_slot(self) -> int:
        """Get the current Solana slot, caching within a request."""
        if self._current_slot is None:
            try:
                solana_client = await get_solana_client()
                self._current_slot = await solana_client.get_slot()
                block_time = await solana_client.get_block_time(self._current_slot)
                if block_time:
                    self._current_block_time = datetime.utcfromtimestamp(block_time)
            except Exception as e:
                logger.warning("Failed to get current slot, using 0", error=str(e))
                self._current_slot = 0
        return self._current_slot

    async def record_change(
        self,
        entity_type: str,
        entity_id: str,
        change_type: ChangeType,
        old_state: Optional[Dict] = None,
        new_state: Optional[Dict] = None,
        token_id: Optional[int] = None,
        triggered_by: Optional[str] = None,
        tx_signature: Optional[str] = None,
        slot: Optional[int] = None,
    ) -> StateChange:
        """
        Record a state change event.

        Args:
            entity_type: Type of entity (e.g., "wallet", "token", "share_position")
            entity_id: Primary key or composite key as string
            change_type: CREATE, UPDATE, or DELETE
            old_state: Previous state as dict (None for CREATE)
            new_state: New state as dict (None for DELETE)
            token_id: Associated token ID for filtering
            triggered_by: What caused this change
            tx_signature: Solana transaction signature if applicable
            slot: Specific slot (defaults to current)
        """
        if slot is None:
            slot = await self.get_current_slot()

        change = StateChange(
            slot=slot,
            block_time=self._current_block_time,
            entity_type=entity_type,
            entity_id=entity_id,
            token_id=token_id,
            change_type=change_type,
            old_state=old_state,
            new_state=new_state,
            triggered_by=triggered_by,
            tx_signature=tx_signature,
        )

        self.db.add(change)
        await self.db.flush()

        logger.info(
            "Recorded state change",
            entity_type=entity_type,
            entity_id=entity_id,
            change_type=change_type.value,
            slot=slot,
        )

        return change

    async def record_model_change(
        self,
        model: Any,
        change_type: ChangeType,
        old_model: Optional[Any] = None,
        triggered_by: Optional[str] = None,
        tx_signature: Optional[str] = None,
        slot: Optional[int] = None,
    ) -> StateChange:
        """
        Convenience method to record a change for a SQLAlchemy model.

        Args:
            model: The SQLAlchemy model instance (new state for CREATE/UPDATE)
            change_type: CREATE, UPDATE, or DELETE
            old_model: Previous model state (for UPDATE)
            triggered_by: What caused this change
            tx_signature: Solana transaction signature if applicable
            slot: Specific slot (defaults to current)
        """
        # Determine entity type from model class
        entity_type = model.__class__.__tablename__

        # Get entity ID from primary key
        pk_columns = [col.name for col in model.__table__.primary_key.columns]
        if len(pk_columns) == 1:
            entity_id = str(getattr(model, pk_columns[0]))
        else:
            # Composite key
            entity_id = ":".join(str(getattr(model, col)) for col in pk_columns)

        # Get token_id if model has it
        token_id = getattr(model, 'token_id', None)

        # Convert models to dicts
        old_state = model_to_dict(old_model) if old_model else None
        new_state = model_to_dict(model) if change_type != ChangeType.DELETE else None

        return await self.record_change(
            entity_type=entity_type,
            entity_id=entity_id,
            change_type=change_type,
            old_state=old_state,
            new_state=new_state,
            token_id=token_id,
            triggered_by=triggered_by,
            tx_signature=tx_signature,
            slot=slot,
        )

    async def get_state_at_slot(
        self,
        entity_type: str,
        entity_id: str,
        slot: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Get the state of an entity at a specific slot.

        Returns the new_state from the most recent StateChange
        for this entity where slot <= target_slot.
        """
        result = await self.db.execute(
            select(StateChange)
            .where(
                and_(
                    StateChange.entity_type == entity_type,
                    StateChange.entity_id == entity_id,
                    StateChange.slot <= slot,
                )
            )
            .order_by(StateChange.slot.desc())
            .limit(1)
        )
        change = result.scalar_one_or_none()

        if change is None:
            return None

        # If the most recent change was a DELETE, entity didn't exist at this slot
        if change.change_type == ChangeType.DELETE:
            return None

        return change.new_state

    async def get_all_states_at_slot(
        self,
        entity_type: str,
        token_id: int,
        slot: int,
    ) -> List[Dict[str, Any]]:
        """
        Get all entities of a type for a token at a specific slot.

        This uses a subquery to find the most recent change for each entity_id
        before the target slot.
        """
        # Subquery to get max slot for each entity before target
        subq = (
            select(
                StateChange.entity_id,
                func.max(StateChange.slot).label('max_slot')
            )
            .where(
                and_(
                    StateChange.entity_type == entity_type,
                    StateChange.token_id == token_id,
                    StateChange.slot <= slot,
                )
            )
            .group_by(StateChange.entity_id)
            .subquery()
        )

        # Join to get the actual records
        result = await self.db.execute(
            select(StateChange)
            .join(
                subq,
                and_(
                    StateChange.entity_id == subq.c.entity_id,
                    StateChange.slot == subq.c.max_slot,
                )
            )
            .where(
                and_(
                    StateChange.entity_type == entity_type,
                    StateChange.token_id == token_id,
                    StateChange.change_type != ChangeType.DELETE,
                )
            )
        )
        changes = result.scalars().all()

        return [change.new_state for change in changes if change.new_state]

    async def create_snapshot(
        self,
        token_id: int,
        trigger: str = "manual",
        slot: Optional[int] = None,
    ) -> CapTableSnapshotV2:
        """
        Create a complete point-in-time snapshot for a token.

        This captures all relevant state for full reconstruction.
        """
        block_time = None
        if slot is None:
            slot = await self.get_current_slot()
            block_time = self._current_block_time
        else:
            # Fetch block time for the provided slot
            try:
                solana_client = await get_solana_client()
                timestamp = await solana_client.get_block_time(slot)
                if timestamp:
                    block_time = datetime.utcfromtimestamp(timestamp)
            except Exception:
                # Fall back to current time if we can't get block time
                block_time = datetime.utcnow()

        # If still no block_time, use current time
        if block_time is None:
            block_time = datetime.utcnow()

        # Get token
        result = await self.db.execute(
            select(Token).where(Token.token_id == token_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            raise ValueError(f"Token {token_id} not found")

        # Get all wallets for this token
        result = await self.db.execute(
            select(Wallet).where(Wallet.token_id == token_id)
        )
        wallets = result.scalars().all()

        # Get all current balances
        result = await self.db.execute(
            select(CurrentBalance)
            .where(CurrentBalance.token_id == token_id)
            .where(CurrentBalance.balance > 0)
        )
        balances = result.scalars().all()

        # Get all share positions
        result = await self.db.execute(
            select(SharePosition)
            .where(SharePosition.token_id == token_id)
            .where(SharePosition.shares > 0)
        )
        share_positions = result.scalars().all()

        # Get all share classes
        result = await self.db.execute(
            select(ShareClass).where(ShareClass.token_id == token_id)
        )
        share_classes = result.scalars().all()

        # Get all vesting schedules
        result = await self.db.execute(
            select(VestingSchedule).where(VestingSchedule.token_id == token_id)
        )
        vesting_schedules = result.scalars().all()

        # Build wallet status map
        wallet_status_map = {w.address: w.status for w in wallets}

        # Build holders list with balance and status
        holders = []
        for b in balances:
            holders.append({
                "wallet": b.wallet,
                "balance": b.balance,
                "status": wallet_status_map.get(b.wallet, "unknown"),
            })

        # Build share positions list
        positions_data = []
        for sp in share_positions:
            positions_data.append({
                "id": sp.id,
                "wallet": sp.wallet,
                "share_class_id": sp.share_class_id,
                "shares": sp.shares,
                "cost_basis": sp.cost_basis,
                "price_per_share": sp.price_per_share,
            })

        # Build vesting data with calculated values
        vesting_data = []
        now = datetime.utcnow()
        for vs in vesting_schedules:
            vested = vs.calculate_vested(now)
            vesting_data.append({
                "id": vs.id,
                "beneficiary": vs.beneficiary,
                "total_amount": vs.total_amount,
                "released_amount": vs.released_amount,
                "vested_amount": vested,
                "unvested_amount": vs.total_amount - vested,
                "start_time": vs.start_time.isoformat() if vs.start_time else None,
                "cliff_duration": vs.cliff_duration,
                "total_duration": vs.total_duration,
                "revoked": vs.revoked,
                "termination_type": vs.termination_type,
            })

        # Build share classes data
        classes_data = []
        for sc in share_classes:
            classes_data.append({
                "id": sc.id,
                "name": sc.name,
                "symbol": sc.symbol,
                "priority": sc.priority,
                "preference_multiple": float(sc.preference_multiple),
            })

        # Create snapshot
        snapshot = CapTableSnapshotV2(
            token_id=token_id,
            slot=slot,
            block_time=block_time,
            total_supply=token.total_supply,
            holder_count=len(holders),
            total_shares=sum(sp.shares for sp in share_positions),
            token_state=model_to_dict(token),
            holders=holders,
            share_positions=positions_data,
            vesting_schedules=vesting_data,
            share_classes=classes_data,
            trigger=trigger,
        )

        self.db.add(snapshot)
        await self.db.flush()

        logger.info(
            "Created cap table snapshot",
            token_id=token_id,
            slot=slot,
            holder_count=len(holders),
            trigger=trigger,
        )

        return snapshot

    async def get_snapshot_at_slot(
        self,
        token_id: int,
        slot: int,
    ) -> Optional[CapTableSnapshotV2]:
        """
        Get the most recent snapshot at or before the given slot.
        """
        result = await self.db.execute(
            select(CapTableSnapshotV2)
            .where(
                and_(
                    CapTableSnapshotV2.token_id == token_id,
                    CapTableSnapshotV2.slot <= slot,
                )
            )
            .order_by(CapTableSnapshotV2.slot.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_snapshots(
        self,
        token_id: int,
        limit: int = 100,
    ) -> List[CapTableSnapshotV2]:
        """List available snapshots for a token."""
        result = await self.db.execute(
            select(CapTableSnapshotV2)
            .where(CapTableSnapshotV2.token_id == token_id)
            .order_by(CapTableSnapshotV2.slot.desc())
            .limit(limit)
        )
        return result.scalars().all()


async def get_history_service(db: AsyncSession) -> HistoryService:
    """Factory function to create a HistoryService."""
    return HistoryService(db)
