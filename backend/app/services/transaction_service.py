"""Transaction service for recording and reconstructing state from unified transactions."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import structlog
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.unified_transaction import UnifiedTransaction, TransactionType
from app.services.solana_client import get_solana_client

logger = structlog.get_logger()


@dataclass
class PositionState:
    """State of a share position at a point in time."""
    wallet: str
    share_class_id: int
    shares: int = 0
    cost_basis: int = 0
    priority: int = 99
    preference_multiple: float = 1.0


@dataclass
class VestingState:
    """State of a vesting schedule at a point in time."""
    schedule_id: int
    beneficiary: str
    total_amount: int
    released_amount: int = 0
    share_class_id: Optional[int] = None
    priority: int = 99
    preference_multiple: float = 1.0
    start_time: Optional[str] = None
    duration_seconds: Optional[int] = None
    cliff_seconds: Optional[int] = None
    vesting_type: Optional[str] = None
    is_terminated: bool = False


@dataclass
class TokenState:
    """Complete token state at a point in time."""
    slot: int
    approved_wallets: Set[str] = field(default_factory=set)
    balances: Dict[str, int] = field(default_factory=dict)  # wallet -> total shares
    positions: Dict[Tuple[str, int], PositionState] = field(default_factory=dict)  # (wallet, class_id) -> position
    vesting_schedules: Dict[int, VestingState] = field(default_factory=dict)  # schedule_id -> state
    is_paused: bool = False
    total_supply: int = 0


class TransactionService:
    """Service for recording and reconstructing state from unified transactions."""

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

    async def record(
        self,
        token_id: int,
        tx_type: TransactionType,
        slot: Optional[int] = None,
        wallet: Optional[str] = None,
        wallet_to: Optional[str] = None,
        amount: Optional[int] = None,
        amount_secondary: Optional[int] = None,
        share_class_id: Optional[int] = None,
        priority: Optional[int] = None,
        preference_multiple: Optional[float] = None,
        price_per_share: Optional[int] = None,
        reference_id: Optional[int] = None,
        reference_type: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
        tx_signature: Optional[str] = None,
        triggered_by: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> UnifiedTransaction:
        """
        Record a transaction to the unified transaction log.

        Args:
            token_id: The token this transaction belongs to
            tx_type: The type of transaction (from TransactionType enum)
            slot: Solana slot number (fetched if not provided)
            wallet: Primary wallet involved
            wallet_to: Secondary wallet (for transfers)
            amount: Primary amount (shares/tokens)
            amount_secondary: Secondary amount (cost_basis, etc.)
            share_class_id: Share class if applicable
            priority: Liquidation priority at tx time
            preference_multiple: Preference multiple at tx time
            price_per_share: Price per share at tx time
            reference_id: ID of related entity
            reference_type: Type of related entity
            data: Additional type-specific data as JSON
            tx_signature: Solana transaction signature
            triggered_by: Actor/system that triggered this
            notes: Human-readable notes

        Returns:
            The created UnifiedTransaction record
        """
        if slot is None:
            slot = await self.get_current_slot()

        tx = UnifiedTransaction(
            token_id=token_id,
            slot=slot,
            block_time=self._current_block_time,
            tx_type=tx_type,
            wallet=wallet,
            wallet_to=wallet_to,
            amount=amount,
            amount_secondary=amount_secondary,
            share_class_id=share_class_id,
            priority=priority,
            preference_multiple=preference_multiple,
            price_per_share=price_per_share,
            reference_id=reference_id,
            reference_type=reference_type,
            data=data,
            tx_signature=tx_signature,
            triggered_by=triggered_by,
            notes=notes,
        )

        self.db.add(tx)
        await self.db.flush()

        logger.info(
            "Recorded transaction",
            tx_id=tx.id,
            tx_type=tx_type.value,
            token_id=token_id,
            slot=slot,
            wallet=wallet,
        )

        return tx

    async def reconstruct_at_slot(self, token_id: int, target_slot: int) -> TokenState:
        """
        Reconstruct complete token state at any slot by replaying transactions.

        Args:
            token_id: The token to reconstruct state for
            target_slot: The slot to reconstruct state at

        Returns:
            TokenState containing the complete state at that slot
        """
        # Get all transactions up to target_slot, ordered by slot then id
        result = await self.db.execute(
            select(UnifiedTransaction)
            .where(
                and_(
                    UnifiedTransaction.token_id == token_id,
                    UnifiedTransaction.slot <= target_slot
                )
            )
            .order_by(UnifiedTransaction.slot, UnifiedTransaction.id)
        )
        transactions = result.scalars().all()

        # Initialize state
        state = TokenState(slot=target_slot)

        # Replay each transaction
        for tx in transactions:
            self._apply_transaction(state, tx)

        logger.info(
            "Reconstructed state",
            token_id=token_id,
            target_slot=target_slot,
            tx_count=len(transactions),
            holder_count=len(state.balances),
        )

        return state

    def _apply_transaction(self, state: TokenState, tx: UnifiedTransaction) -> None:
        """Apply a single transaction to the state."""
        match tx.tx_type:
            case TransactionType.APPROVAL:
                if tx.wallet:
                    state.approved_wallets.add(tx.wallet)

            case TransactionType.REVOCATION:
                if tx.wallet:
                    state.approved_wallets.discard(tx.wallet)

            case TransactionType.MINT | TransactionType.SHARE_GRANT:
                if tx.wallet and tx.amount:
                    # Add to position
                    key = (tx.wallet, tx.share_class_id)
                    if key not in state.positions:
                        state.positions[key] = PositionState(
                            wallet=tx.wallet,
                            share_class_id=tx.share_class_id or 0,
                            shares=0,
                            cost_basis=0,
                            priority=tx.priority or 99,
                            preference_multiple=tx.preference_multiple or 1.0,
                        )
                    state.positions[key].shares += tx.amount
                    state.positions[key].cost_basis += tx.amount_secondary or 0

                    # Add to balance
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount
                    state.total_supply += tx.amount

            case TransactionType.TRANSFER:
                if tx.wallet and tx.wallet_to and tx.amount:
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) - tx.amount
                    state.balances[tx.wallet_to] = state.balances.get(tx.wallet_to, 0) + tx.amount

            case TransactionType.BURN:
                if tx.wallet and tx.amount:
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) - tx.amount
                    state.total_supply -= tx.amount

            case TransactionType.VESTING_SCHEDULE_CREATE:
                if tx.reference_id and tx.wallet:
                    data = tx.data or {}
                    state.vesting_schedules[tx.reference_id] = VestingState(
                        schedule_id=tx.reference_id,
                        beneficiary=tx.wallet,
                        total_amount=tx.amount or 0,
                        released_amount=0,
                        share_class_id=tx.share_class_id,
                        priority=tx.priority or 99,
                        preference_multiple=tx.preference_multiple or 1.0,
                        start_time=data.get("start_time"),
                        duration_seconds=data.get("duration_seconds"),
                        cliff_seconds=data.get("cliff_seconds"),
                        vesting_type=data.get("vesting_type"),
                    )

            case TransactionType.VESTING_RELEASE:
                if tx.wallet and tx.amount:
                    # Add released shares to position and balance
                    key = (tx.wallet, tx.share_class_id)
                    if key not in state.positions:
                        state.positions[key] = PositionState(
                            wallet=tx.wallet,
                            share_class_id=tx.share_class_id or 0,
                            shares=0,
                            cost_basis=0,
                            priority=tx.priority or 99,
                            preference_multiple=tx.preference_multiple or 1.0,
                        )
                    state.positions[key].shares += tx.amount
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount
                    state.total_supply += tx.amount

                    # Update schedule's released amount
                    if tx.reference_id and tx.reference_id in state.vesting_schedules:
                        state.vesting_schedules[tx.reference_id].released_amount += tx.amount

            case TransactionType.VESTING_TERMINATE:
                if tx.reference_id and tx.reference_id in state.vesting_schedules:
                    state.vesting_schedules[tx.reference_id].is_terminated = True

            case TransactionType.STOCK_SPLIT:
                if tx.data:
                    numerator = tx.data.get("numerator", 1)
                    denominator = tx.data.get("denominator", 1)
                    if denominator > 0:
                        ratio = numerator / denominator
                        # Apply split to all balances
                        for wallet in state.balances:
                            state.balances[wallet] = int(state.balances[wallet] * ratio)
                        # Apply split to all positions
                        for key in state.positions:
                            state.positions[key].shares = int(state.positions[key].shares * ratio)
                        # Apply split to vesting schedules
                        for vs_id in state.vesting_schedules:
                            vs = state.vesting_schedules[vs_id]
                            vs.total_amount = int(vs.total_amount * ratio)
                            vs.released_amount = int(vs.released_amount * ratio)
                        # Update total supply
                        state.total_supply = int(state.total_supply * ratio)

            case TransactionType.PAUSE:
                if tx.data:
                    state.is_paused = tx.data.get("paused", False)

            case TransactionType.CONVERTIBLE_CONVERT:
                # SAFE/Note conversion - adds shares to holder
                if tx.wallet and tx.amount:
                    # Add to position
                    key = (tx.wallet, tx.share_class_id)
                    if key not in state.positions:
                        state.positions[key] = PositionState(
                            wallet=tx.wallet,
                            share_class_id=tx.share_class_id or 0,
                            shares=0,
                            cost_basis=0,
                            priority=tx.priority or 99,
                            preference_multiple=tx.preference_multiple or 1.0,
                        )
                    state.positions[key].shares += tx.amount
                    state.positions[key].cost_basis += tx.amount_secondary or 0

                    # Add to balance
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount
                    state.total_supply += tx.amount

            case TransactionType.INVESTMENT:
                # Investment in funding round - adds shares to investor
                if tx.wallet and tx.amount:
                    # Add to position
                    key = (tx.wallet, tx.share_class_id)
                    if key not in state.positions:
                        state.positions[key] = PositionState(
                            wallet=tx.wallet,
                            share_class_id=tx.share_class_id or 0,
                            shares=0,
                            cost_basis=0,
                            priority=tx.priority or 99,
                            preference_multiple=tx.preference_multiple or 1.0,
                        )
                    state.positions[key].shares += tx.amount
                    state.positions[key].cost_basis += tx.amount_secondary or 0

                    # Add to balance
                    state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount
                    state.total_supply += tx.amount

            # Other transaction types don't directly affect reconstructed state
            # (proposals, votes, dividends, funding rounds, etc. are tracked
            # but don't change holder balances in the same way)

    async def get_activity(
        self,
        token_id: int,
        limit: int = 50,
        offset: int = 0,
        tx_types: Optional[List[TransactionType]] = None,
    ) -> List[UnifiedTransaction]:
        """
        Get transaction activity for a token.

        Args:
            token_id: The token to get activity for
            limit: Maximum records to return
            offset: Records to skip
            tx_types: Optional filter for specific transaction types

        Returns:
            List of transactions ordered by slot descending
        """
        query = select(UnifiedTransaction).where(
            UnifiedTransaction.token_id == token_id
        )

        if tx_types:
            query = query.where(UnifiedTransaction.tx_type.in_(tx_types))

        query = query.order_by(
            UnifiedTransaction.slot.desc(),
            UnifiedTransaction.id.desc()
        ).limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_wallet_activity(
        self,
        wallet: str,
        token_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[UnifiedTransaction]:
        """
        Get transaction activity for a specific wallet.

        Args:
            wallet: The wallet address to get activity for
            token_id: Optional filter for specific token
            limit: Maximum records to return
            offset: Records to skip

        Returns:
            List of transactions involving this wallet
        """
        # Match wallet in either wallet or wallet_to columns
        conditions = [
            (UnifiedTransaction.wallet == wallet) |
            (UnifiedTransaction.wallet_to == wallet)
        ]

        if token_id is not None:
            conditions.append(UnifiedTransaction.token_id == token_id)

        query = select(UnifiedTransaction).where(
            and_(*conditions)
        ).order_by(
            UnifiedTransaction.slot.desc(),
            UnifiedTransaction.id.desc()
        ).limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_transactions_at_slot(
        self,
        token_id: int,
        slot: int,
    ) -> List[UnifiedTransaction]:
        """
        Get all transactions at a specific slot.

        Args:
            token_id: The token to get transactions for
            slot: The specific slot to query

        Returns:
            List of transactions at that slot
        """
        result = await self.db.execute(
            select(UnifiedTransaction).where(
                and_(
                    UnifiedTransaction.token_id == token_id,
                    UnifiedTransaction.slot == slot
                )
            ).order_by(UnifiedTransaction.id)
        )
        return list(result.scalars().all())
