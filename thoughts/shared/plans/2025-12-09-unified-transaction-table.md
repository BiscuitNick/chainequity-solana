# Unified Transaction Table Implementation Plan

## Overview

Create a single `unified_transactions` table that captures every state-changing event with slot timestamps, enabling instant historical snapshot generation at any arbitrary slot through transaction replay.

## Design Principles

1. **Single source of truth** - One table for all events
2. **Slot-indexed** - Every transaction has a slot number
3. **Explicit events only** - No calculated values; vesting releases recorded explicitly at intervals
4. **Pure replay** - Historical state reconstructed by replaying transactions (no pre-computed snapshots)

---

## Unified Transaction Table Schema

### Transaction Types

```python
class TransactionType(str, enum.Enum):
    """All transaction types in the system."""
    # Allowlist
    APPROVAL = "approval"
    REVOCATION = "revocation"

    # Token operations
    MINT = "mint"
    TRANSFER = "transfer"
    BURN = "burn"

    # Vesting
    VESTING_SCHEDULE_CREATE = "vesting_schedule_create"
    VESTING_RELEASE = "vesting_release"  # Explicit events at intervals
    VESTING_TERMINATE = "vesting_terminate"

    # Share operations
    SHARE_GRANT = "share_grant"

    # Governance
    PROPOSAL_CREATE = "proposal_create"
    VOTE = "vote"
    PROPOSAL_EXECUTE = "proposal_execute"

    # Dividends
    DIVIDEND_ROUND_CREATE = "dividend_round_create"
    DIVIDEND_PAYMENT = "dividend_payment"

    # Corporate actions
    STOCK_SPLIT = "stock_split"
    SYMBOL_CHANGE = "symbol_change"
    PAUSE = "pause"

    # Investment operations
    FUNDING_ROUND_CREATE = "funding_round_create"
    FUNDING_ROUND_CLOSE = "funding_round_close"
    INVESTMENT = "investment"
    CONVERTIBLE_CREATE = "convertible_create"
    CONVERTIBLE_CONVERT = "convertible_convert"
    VALUATION_UPDATE = "valuation_update"
```

### Table Model

```python
class UnifiedTransaction(Base):
    """
    Single table capturing all state-changing events.

    Historical state is reconstructed by replaying transactions up to target slot.
    """
    __tablename__ = "unified_transactions"

    id = Column(Integer, primary_key=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)

    # Temporal tracking - REQUIRED
    slot = Column(BigInteger, nullable=False, index=True)
    block_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Transaction type (discriminator)
    tx_type = Column(SQLEnum(TransactionType), nullable=False, index=True)

    # Core identifiers
    wallet = Column(String(44), nullable=True, index=True)  # Primary wallet
    wallet_to = Column(String(44), nullable=True, index=True)  # Secondary (transfers)

    # Numeric values
    amount = Column(BigInteger, nullable=True)  # Shares/tokens
    amount_secondary = Column(BigInteger, nullable=True)  # Cost basis, etc.

    # Share class tracking (for investment analysis)
    share_class_id = Column(Integer, ForeignKey("share_classes.id"), nullable=True, index=True)
    priority = Column(Integer, nullable=True)  # Liquidation priority at tx time
    preference_multiple = Column(Float, nullable=True)  # Preference at tx time
    price_per_share = Column(BigInteger, nullable=True)  # Price at tx time

    # Reference to related entities
    reference_id = Column(Integer, nullable=True)
    reference_type = Column(String(50), nullable=True)

    # Flexible data for type-specific fields
    data = Column(JSONB, nullable=True)

    # Metadata
    tx_signature = Column(String(100), nullable=True, index=True)
    triggered_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    # Indexes
    __table_args__ = (
        Index('ix_unified_tx_token_slot', 'token_id', 'slot'),
        Index('ix_unified_tx_wallet_slot', 'wallet', 'slot'),
        Index('ix_unified_tx_type_token_slot', 'tx_type', 'token_id', 'slot'),
        Index('ix_unified_tx_share_class_slot', 'share_class_id', 'slot'),
    )
```

---

## Transaction Examples

### Approval
```json
{
  "tx_type": "approval",
  "wallet": "fff...fff",
  "slot": 350,
  "data": {"approved_by": "admin_wallet"}
}
```

### Mint with Share Class
```json
{
  "tx_type": "mint",
  "wallet": "fff...fff",
  "slot": 400,
  "amount": 10000,
  "share_class_id": 1,
  "priority": 90,
  "preference_multiple": 1.0,
  "price_per_share": 100,
  "amount_secondary": 1000000,
  "data": {"notes": "Founder shares"}
}
```

### Vesting Schedule Create
```json
{
  "tx_type": "vesting_schedule_create",
  "wallet": "abc...xyz",
  "slot": 1100,
  "amount": 15000,
  "share_class_id": 1,
  "priority": 90,
  "preference_multiple": 1.0,
  "reference_id": 5,
  "reference_type": "vesting_schedule",
  "data": {
    "start_time": "2025-01-01T00:00:00Z",
    "duration_seconds": 126230400,
    "cliff_seconds": 31557600,
    "vesting_type": "cliff_then_linear",
    "interval_seconds": 60
  }
}
```

### Vesting Release (Explicit - recorded at intervals)
```json
{
  "tx_type": "vesting_release",
  "wallet": "abc...xyz",
  "slot": 1200,
  "amount": 150,
  "share_class_id": 1,
  "priority": 90,
  "preference_multiple": 1.0,
  "reference_id": 5,
  "reference_type": "vesting_schedule"
}
```

### Stock Split
```json
{
  "tx_type": "stock_split",
  "slot": 5000,
  "data": {
    "numerator": 2,
    "denominator": 1
  }
}
```

---

## Vesting Release Scheduler

Vesting events are recorded explicitly at configured intervals (e.g., every minute):

```python
class VestingScheduler:
    """
    Background task that records vesting release events at intervals.
    """

    async def process_vesting_releases(self, token_id: int):
        """
        Called periodically (e.g., every minute).
        Records VESTING_RELEASE transactions for any newly vested shares.
        """
        current_slot = await self.get_current_slot()
        current_time = datetime.utcnow()

        # Get all active vesting schedules
        schedules = await self.get_active_schedules(token_id)

        for schedule in schedules:
            # Calculate vested amount based on current time
            vested_now = self.calculate_vested(schedule, current_time)
            previously_released = schedule.released_amount
            newly_vested = vested_now - previously_released

            if newly_vested > 0:
                # Record explicit vesting release transaction
                await self.record_transaction(
                    token_id=token_id,
                    tx_type=TransactionType.VESTING_RELEASE,
                    slot=current_slot,
                    wallet=schedule.beneficiary,
                    amount=newly_vested,
                    share_class_id=schedule.share_class_id,
                    priority=schedule.share_class.priority,
                    preference_multiple=schedule.share_class.preference_multiple,
                    reference_id=schedule.id,
                    reference_type="vesting_schedule"
                )

                # Update schedule's released_amount
                schedule.released_amount = vested_now
```

---

## Historical Reconstruction

### Algorithm

```python
async def reconstruct_state_at_slot(token_id: int, target_slot: int) -> TokenState:
    """
    Reconstruct complete token state at any slot by replaying transactions.
    """
    # Get all transactions up to target_slot
    txs = await db.execute(
        select(UnifiedTransaction)
        .where(
            UnifiedTransaction.token_id == token_id,
            UnifiedTransaction.slot <= target_slot
        )
        .order_by(UnifiedTransaction.slot, UnifiedTransaction.id)
    )

    # Initialize state
    state = TokenState(
        approved_wallets=set(),
        balances={},  # wallet -> shares
        positions={},  # (wallet, class_id) -> PositionState
        vesting_schedules={},  # schedule_id -> VestingState
        proposals={},
        is_paused=False
    )

    # Replay each transaction
    for tx in txs.scalars():
        apply_transaction(state, tx)

    return state


def apply_transaction(state: TokenState, tx: UnifiedTransaction):
    """Apply a single transaction to state."""
    match tx.tx_type:
        case TransactionType.APPROVAL:
            state.approved_wallets.add(tx.wallet)

        case TransactionType.REVOCATION:
            state.approved_wallets.discard(tx.wallet)

        case TransactionType.MINT | TransactionType.SHARE_GRANT:
            # Add to position
            key = (tx.wallet, tx.share_class_id)
            if key not in state.positions:
                state.positions[key] = PositionState(
                    shares=0, cost_basis=0,
                    priority=tx.priority,
                    preference_multiple=tx.preference_multiple
                )
            state.positions[key].shares += tx.amount
            state.positions[key].cost_basis += tx.amount_secondary or 0

            # Add to balance
            state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount

        case TransactionType.TRANSFER:
            state.balances[tx.wallet] -= tx.amount
            state.balances[tx.wallet_to] = state.balances.get(tx.wallet_to, 0) + tx.amount

        case TransactionType.VESTING_SCHEDULE_CREATE:
            state.vesting_schedules[tx.reference_id] = VestingState(
                beneficiary=tx.wallet,
                total_amount=tx.amount,
                released_amount=0,
                share_class_id=tx.share_class_id,
                **tx.data
            )

        case TransactionType.VESTING_RELEASE:
            # Vesting releases are explicit - just add to balance/position
            key = (tx.wallet, tx.share_class_id)
            if key not in state.positions:
                state.positions[key] = PositionState(
                    shares=0, cost_basis=0,
                    priority=tx.priority,
                    preference_multiple=tx.preference_multiple
                )
            state.positions[key].shares += tx.amount
            state.balances[tx.wallet] = state.balances.get(tx.wallet, 0) + tx.amount

            # Update schedule's released amount
            if tx.reference_id in state.vesting_schedules:
                state.vesting_schedules[tx.reference_id].released_amount += tx.amount

        case TransactionType.STOCK_SPLIT:
            ratio = tx.data["numerator"] / tx.data["denominator"]
            for wallet in state.balances:
                state.balances[wallet] = int(state.balances[wallet] * ratio)
            for key in state.positions:
                state.positions[key].shares = int(state.positions[key].shares * ratio)
            for vs_id in state.vesting_schedules:
                vs = state.vesting_schedules[vs_id]
                vs.total_amount = int(vs.total_amount * ratio)
                vs.released_amount = int(vs.released_amount * ratio)

        case TransactionType.PAUSE:
            state.is_paused = tx.data.get("paused", False)
```

---

## Tables to Remove (After Implementation)

Once the unified transaction table is working, these tables can be removed:

| Table | Replaced By |
|-------|-------------|
| `transfers` | `unified_transactions` with `tx_type=TRANSFER` |
| `transactions` | `unified_transactions` |
| `corporate_actions` | `unified_transactions` with `tx_type=STOCK_SPLIT/SYMBOL_CHANGE/PAUSE` |
| `state_changes` | `unified_transactions` |
| `token_issuances` | `unified_transactions` with `tx_type=MINT` |
| `share_grants` | `unified_transactions` with `tx_type=SHARE_GRANT` |
| `captable_snapshots` | Reconstruction from transactions |
| `captable_snapshots_v2` | Reconstruction from transactions |

Tables to **KEEP**:
- `tokens` - Core token metadata
- `wallets` - Wallet metadata (name, KYC, etc.)
- `share_classes` - Share class definitions
- `vesting_schedules` - Active schedule state (released_amount tracking)
- `funding_rounds` - Funding round metadata
- `investments` - Investment details
- `convertible_instruments` - Convertible details
- `valuation_events` - Valuation history
- `dividend_rounds` - Dividend round metadata
- `dividend_payments` - Payment tracking
- `proposals` - Governance proposals
- `votes` - Vote records
- `current_balances` - Current state cache (optional, can be derived)

---

## Implementation Phases

### Phase 1: Database Schema

**Files to create/modify:**
- `backend/app/models/unified_transaction.py` - New model
- `backend/alembic/versions/xxx_add_unified_transactions.py` - Migration

**Success Criteria:**
- [ ] Migration applies cleanly: `alembic upgrade head`
- [ ] Model imports without errors

---

### Phase 2: Transaction Service

**Files to create:**
- `backend/app/services/transaction_service.py` - Recording and reconstruction

**Key methods:**
```python
class TransactionService:
    async def record(self, token_id, tx_type, slot, **kwargs) -> UnifiedTransaction
    async def reconstruct_at_slot(self, token_id, slot) -> TokenState
    async def get_activity(self, token_id, limit, offset) -> List[UnifiedTransaction]
    async def get_wallet_activity(self, wallet, token_id, limit) -> List[UnifiedTransaction]
```

**Success Criteria:**
- [ ] Can record transactions
- [ ] Can reconstruct state at arbitrary slots
- [ ] Unit tests pass

---

### Phase 3: Wire Up Endpoints

Update these endpoint modules to record transactions:

| Module | Transaction Types to Record |
|--------|---------------------------|
| `allowlist.py` | APPROVAL, REVOCATION |
| `issuance.py` | MINT |
| `vesting.py` | VESTING_SCHEDULE_CREATE, VESTING_TERMINATE |
| `share_classes.py` | SHARE_GRANT |
| `governance.py` | PROPOSAL_CREATE, VOTE, PROPOSAL_EXECUTE |
| `dividends.py` | DIVIDEND_ROUND_CREATE, DIVIDEND_PAYMENT |
| `admin.py` | STOCK_SPLIT, SYMBOL_CHANGE, PAUSE |
| `funding_rounds.py` | FUNDING_ROUND_CREATE, FUNDING_ROUND_CLOSE, INVESTMENT |
| `convertibles.py` | CONVERTIBLE_CREATE, CONVERTIBLE_CONVERT |
| `valuations.py` | VALUATION_UPDATE |

**Success Criteria:**
- [ ] All state-changing endpoints record to `unified_transactions`
- [ ] Existing functionality unchanged

---

### Phase 4: Vesting Scheduler

**Files to create:**
- `backend/app/services/vesting_scheduler.py` - Background vesting processor

**Implementation:**
- Background task runs every minute (configurable)
- Checks all active vesting schedules
- Records VESTING_RELEASE transactions for newly vested shares

**Success Criteria:**
- [ ] Vesting releases recorded at configured intervals
- [ ] Released amounts match expected vesting curves

---

### Phase 5: Historical Reconstruction API

**New endpoints:**
- `GET /tokens/{token_id}/state/{slot}` - Reconstructed state at slot
- `GET /tokens/{token_id}/activity` - Transaction activity feed
- `GET /tokens/{token_id}/activity/wallet/{address}` - Wallet activity

**Success Criteria:**
- [ ] Can reconstruct state at any slot
- [ ] Activity feed returns transactions
- [ ] Performance acceptable (< 1s for typical token)

---

### Phase 6: Cleanup (Separate Plan)

After transaction table is stable:
1. Remove deprecated tables
2. Remove deprecated endpoints
3. Simplify existing models

---

## What We're NOT Doing

- **No backfill** - Fresh DB, no migration of old data
- **No pre-computed snapshots** - Pure transaction replay
- **No calculated vesting** - Explicit release events only
- **No endpoint removal yet** - That's a separate cleanup phase

---

## Open Questions

None - all clarified. Ready to implement.
