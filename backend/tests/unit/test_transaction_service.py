"""Unit tests for the transaction service and unified transaction recording."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.models.unified_transaction import UnifiedTransaction, TransactionType
from app.services.transaction_service import TransactionService, TokenState, PositionState, VestingState


class TestTransactionType:
    """Tests for TransactionType enum."""

    def test_all_required_types_exist(self):
        """Verify all required transaction types are defined."""
        required_types = [
            # Allowlist
            'approval', 'revocation',
            # Token operations
            'mint', 'transfer', 'burn',
            # Vesting
            'vesting_schedule_create', 'vesting_release', 'vesting_terminate',
            # Share operations
            'share_grant',
            # Governance
            'proposal_create', 'vote', 'proposal_execute',
            # Dividends
            'dividend_round_create', 'dividend_payment',
            # Corporate actions
            'stock_split', 'symbol_change', 'pause',
            # Investment operations
            'funding_round_create', 'funding_round_close', 'investment',
            'convertible_create', 'convertible_convert', 'valuation_update',
        ]

        actual_types = [t.value for t in TransactionType]

        for req_type in required_types:
            assert req_type in actual_types, f"Missing transaction type: {req_type}"

    def test_transaction_type_string_values(self):
        """Test that transaction types have correct string values."""
        assert TransactionType.APPROVAL.value == "approval"
        assert TransactionType.STOCK_SPLIT.value == "stock_split"
        assert TransactionType.PROPOSAL_CREATE.value == "proposal_create"
        assert TransactionType.VOTE.value == "vote"
        assert TransactionType.PROPOSAL_EXECUTE.value == "proposal_execute"
        assert TransactionType.SYMBOL_CHANGE.value == "symbol_change"


class TestTokenState:
    """Tests for TokenState dataclass."""

    def test_initial_state(self):
        """Test that TokenState initializes with correct defaults."""
        state = TokenState(slot=12345)

        assert state.slot == 12345
        assert state.approved_wallets == set()
        assert state.balances == {}
        assert state.positions == {}
        assert state.vesting_schedules == {}
        assert state.is_paused is False
        assert state.total_supply == 0

    def test_state_mutation(self):
        """Test that TokenState can be mutated correctly."""
        state = TokenState(slot=100)

        state.approved_wallets.add("wallet1")
        state.balances["wallet1"] = 1000
        state.total_supply = 1000

        assert "wallet1" in state.approved_wallets
        assert state.balances["wallet1"] == 1000
        assert state.total_supply == 1000


class TestPositionState:
    """Tests for PositionState dataclass."""

    def test_position_state_defaults(self):
        """Test PositionState default values."""
        pos = PositionState(wallet="wallet1", share_class_id=1)

        assert pos.wallet == "wallet1"
        assert pos.share_class_id == 1
        assert pos.shares == 0
        assert pos.cost_basis == 0
        assert pos.priority == 99
        assert pos.preference_multiple == 1.0


class TestVestingState:
    """Tests for VestingState dataclass."""

    def test_vesting_state_defaults(self):
        """Test VestingState default values."""
        vs = VestingState(schedule_id=1, beneficiary="wallet1", total_amount=10000)

        assert vs.schedule_id == 1
        assert vs.beneficiary == "wallet1"
        assert vs.total_amount == 10000
        assert vs.released_amount == 0
        assert vs.is_terminated is False


class TestTransactionServiceApplyTransaction:
    """Tests for TransactionService._apply_transaction method."""

    def test_apply_approval(self):
        """Test applying APPROVAL transaction."""
        state = TokenState(slot=100)
        tx = MagicMock()
        tx.tx_type = TransactionType.APPROVAL
        tx.wallet = "wallet1"

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert "wallet1" in state.approved_wallets

    def test_apply_revocation(self):
        """Test applying REVOCATION transaction."""
        state = TokenState(slot=100)
        state.approved_wallets.add("wallet1")

        tx = MagicMock()
        tx.tx_type = TransactionType.REVOCATION
        tx.wallet = "wallet1"

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert "wallet1" not in state.approved_wallets

    def test_apply_mint(self):
        """Test applying MINT transaction."""
        state = TokenState(slot=100)

        tx = MagicMock()
        tx.tx_type = TransactionType.MINT
        tx.wallet = "wallet1"
        tx.amount = 1000
        tx.amount_secondary = 500  # cost_basis
        tx.share_class_id = 1
        tx.priority = 1
        tx.preference_multiple = 1.5

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.balances["wallet1"] == 1000
        assert state.total_supply == 1000
        assert ("wallet1", 1) in state.positions
        assert state.positions[("wallet1", 1)].shares == 1000
        assert state.positions[("wallet1", 1)].cost_basis == 500

    def test_apply_share_grant(self):
        """Test applying SHARE_GRANT transaction."""
        state = TokenState(slot=100)

        tx = MagicMock()
        tx.tx_type = TransactionType.SHARE_GRANT
        tx.wallet = "wallet1"
        tx.amount = 500
        tx.amount_secondary = 250  # cost_basis
        tx.share_class_id = 2
        tx.priority = 2
        tx.preference_multiple = 1.0

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.balances["wallet1"] == 500
        assert state.total_supply == 500

    def test_apply_transfer(self):
        """Test applying TRANSFER transaction."""
        state = TokenState(slot=100)
        state.balances["wallet1"] = 1000
        state.balances["wallet2"] = 0

        tx = MagicMock()
        tx.tx_type = TransactionType.TRANSFER
        tx.wallet = "wallet1"
        tx.wallet_to = "wallet2"
        tx.amount = 300

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.balances["wallet1"] == 700
        assert state.balances["wallet2"] == 300

    def test_apply_burn(self):
        """Test applying BURN transaction."""
        state = TokenState(slot=100)
        state.balances["wallet1"] = 1000
        state.total_supply = 1000

        tx = MagicMock()
        tx.tx_type = TransactionType.BURN
        tx.wallet = "wallet1"
        tx.amount = 200

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.balances["wallet1"] == 800
        assert state.total_supply == 800

    def test_apply_stock_split(self):
        """Test applying STOCK_SPLIT transaction (2:1 split)."""
        state = TokenState(slot=100)
        state.balances["wallet1"] = 1000
        state.balances["wallet2"] = 500
        state.total_supply = 1500
        state.positions[("wallet1", 1)] = PositionState(
            wallet="wallet1", share_class_id=1, shares=1000
        )
        state.vesting_schedules[1] = VestingState(
            schedule_id=1, beneficiary="wallet1", total_amount=1000, released_amount=500
        )

        tx = MagicMock()
        tx.tx_type = TransactionType.STOCK_SPLIT
        tx.data = {"numerator": 2, "denominator": 1}

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        # 2:1 split doubles everything
        assert state.balances["wallet1"] == 2000
        assert state.balances["wallet2"] == 1000
        assert state.total_supply == 3000
        assert state.positions[("wallet1", 1)].shares == 2000
        assert state.vesting_schedules[1].total_amount == 2000
        assert state.vesting_schedules[1].released_amount == 1000

    def test_apply_reverse_split(self):
        """Test applying STOCK_SPLIT transaction (1:2 reverse split)."""
        state = TokenState(slot=100)
        state.balances["wallet1"] = 1000
        state.total_supply = 1000

        tx = MagicMock()
        tx.tx_type = TransactionType.STOCK_SPLIT
        tx.data = {"numerator": 1, "denominator": 2}

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        # 1:2 reverse split halves everything
        assert state.balances["wallet1"] == 500
        assert state.total_supply == 500

    def test_apply_pause(self):
        """Test applying PAUSE transaction."""
        state = TokenState(slot=100)

        tx = MagicMock()
        tx.tx_type = TransactionType.PAUSE
        tx.data = {"paused": True}

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.is_paused is True

        # Test unpause
        tx.data = {"paused": False}
        service._apply_transaction(state, tx)

        assert state.is_paused is False

    def test_apply_vesting_schedule_create(self):
        """Test applying VESTING_SCHEDULE_CREATE transaction."""
        state = TokenState(slot=100)

        tx = MagicMock()
        tx.tx_type = TransactionType.VESTING_SCHEDULE_CREATE
        tx.reference_id = 1
        tx.wallet = "beneficiary1"
        tx.amount = 10000
        tx.share_class_id = 1
        tx.priority = 2
        tx.preference_multiple = 1.5
        tx.data = {
            "start_time": "2024-01-01T00:00:00",
            "duration_seconds": 31536000,
            "cliff_seconds": 7884000,
            "vesting_type": "linear",
        }

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert 1 in state.vesting_schedules
        vs = state.vesting_schedules[1]
        assert vs.beneficiary == "beneficiary1"
        assert vs.total_amount == 10000
        assert vs.released_amount == 0
        assert vs.share_class_id == 1

    def test_apply_vesting_release(self):
        """Test applying VESTING_RELEASE transaction."""
        state = TokenState(slot=100)
        state.vesting_schedules[1] = VestingState(
            schedule_id=1, beneficiary="wallet1", total_amount=10000,
            released_amount=0, share_class_id=1
        )

        tx = MagicMock()
        tx.tx_type = TransactionType.VESTING_RELEASE
        tx.wallet = "wallet1"
        tx.amount = 2500
        tx.share_class_id = 1
        tx.reference_id = 1
        tx.priority = 99
        tx.preference_multiple = 1.0

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        # Shares added to balance and position
        assert state.balances["wallet1"] == 2500
        assert state.total_supply == 2500
        assert ("wallet1", 1) in state.positions
        assert state.positions[("wallet1", 1)].shares == 2500

        # Vesting schedule updated
        assert state.vesting_schedules[1].released_amount == 2500

    def test_apply_vesting_terminate(self):
        """Test applying VESTING_TERMINATE transaction."""
        state = TokenState(slot=100)
        state.vesting_schedules[1] = VestingState(
            schedule_id=1, beneficiary="wallet1", total_amount=10000
        )

        tx = MagicMock()
        tx.tx_type = TransactionType.VESTING_TERMINATE
        tx.reference_id = 1

        service = TransactionService(MagicMock())
        service._apply_transaction(state, tx)

        assert state.vesting_schedules[1].is_terminated is True

    def test_governance_transactions_dont_affect_balances(self):
        """Test that governance transactions don't modify holder balances."""
        state = TokenState(slot=100)
        state.balances["wallet1"] = 1000
        initial_balance = state.balances["wallet1"]

        service = TransactionService(MagicMock())

        # PROPOSAL_CREATE
        tx = MagicMock()
        tx.tx_type = TransactionType.PROPOSAL_CREATE
        tx.wallet = "wallet1"
        tx.data = {}
        service._apply_transaction(state, tx)
        assert state.balances["wallet1"] == initial_balance

        # VOTE
        tx.tx_type = TransactionType.VOTE
        service._apply_transaction(state, tx)
        assert state.balances["wallet1"] == initial_balance

        # PROPOSAL_EXECUTE
        tx.tx_type = TransactionType.PROPOSAL_EXECUTE
        service._apply_transaction(state, tx)
        assert state.balances["wallet1"] == initial_balance


class TestTransactionServiceRecord:
    """Tests for TransactionService.record method."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_record_creates_transaction(self, mock_db):
        """Test that record creates a UnifiedTransaction."""
        service = TransactionService(mock_db)
        service._current_slot = 12345
        service._current_block_time = datetime.utcnow()

        tx = await service.record(
            token_id=1,
            tx_type=TransactionType.APPROVAL,
            slot=12345,
            wallet="wallet1",
        )

        mock_db.add.assert_called_once()
        mock_db.flush.assert_awaited_once()

        # Verify the transaction was created with correct values
        added_tx = mock_db.add.call_args[0][0]
        assert added_tx.token_id == 1
        assert added_tx.tx_type == TransactionType.APPROVAL
        assert added_tx.slot == 12345
        assert added_tx.wallet == "wallet1"

    @pytest.mark.asyncio
    async def test_record_with_all_fields(self, mock_db):
        """Test recording a transaction with all optional fields."""
        service = TransactionService(mock_db)
        service._current_slot = 12345

        await service.record(
            token_id=1,
            tx_type=TransactionType.SHARE_GRANT,
            slot=12345,
            wallet="wallet1",
            wallet_to="wallet2",
            amount=1000,
            amount_secondary=500,
            share_class_id=1,
            priority=1,
            preference_multiple=1.5,
            price_per_share=100,
            reference_id=10,
            reference_type="vesting_schedule",
            data={"key": "value"},
            tx_signature="sig123",
            triggered_by="admin",
            notes="Test grant",
        )

        added_tx = mock_db.add.call_args[0][0]
        assert added_tx.wallet == "wallet1"
        assert added_tx.wallet_to == "wallet2"
        assert added_tx.amount == 1000
        assert added_tx.amount_secondary == 500
        assert added_tx.share_class_id == 1
        assert added_tx.priority == 1
        assert added_tx.preference_multiple == 1.5
        assert added_tx.price_per_share == 100
        assert added_tx.reference_id == 10
        assert added_tx.reference_type == "vesting_schedule"
        assert added_tx.data == {"key": "value"}
        assert added_tx.tx_signature == "sig123"
        assert added_tx.triggered_by == "admin"
        assert added_tx.notes == "Test grant"


class TestStateReconstruction:
    """Integration tests for state reconstruction from transactions."""

    def test_reconstruct_complex_scenario(self):
        """Test reconstruction of a complex scenario with multiple transaction types."""
        service = TransactionService(MagicMock())
        state = TokenState(slot=1000)

        # Create mock transactions representing a realistic sequence
        transactions = [
            # Initial approvals
            self._create_tx(TransactionType.APPROVAL, wallet="founder1"),
            self._create_tx(TransactionType.APPROVAL, wallet="founder2"),
            self._create_tx(TransactionType.APPROVAL, wallet="investor1"),

            # Share grants (founding shares)
            self._create_tx(TransactionType.SHARE_GRANT, wallet="founder1", amount=5000000,
                          share_class_id=1, amount_secondary=0),
            self._create_tx(TransactionType.SHARE_GRANT, wallet="founder2", amount=3000000,
                          share_class_id=1, amount_secondary=0),

            # Investor share grant
            self._create_tx(TransactionType.SHARE_GRANT, wallet="investor1", amount=1000000,
                          share_class_id=2, amount_secondary=100000000),  # $1M cost basis

            # Create vesting schedule for advisor
            self._create_tx(TransactionType.VESTING_SCHEDULE_CREATE, wallet="advisor1",
                          reference_id=1, amount=500000, share_class_id=1),

            # Vesting release
            self._create_tx(TransactionType.VESTING_RELEASE, wallet="advisor1",
                          reference_id=1, amount=125000, share_class_id=1),

            # Stock split 2:1
            self._create_tx(TransactionType.STOCK_SPLIT, data={"numerator": 2, "denominator": 1}),

            # Transfer some shares
            self._create_tx(TransactionType.TRANSFER, wallet="founder1", wallet_to="founder2",
                          amount=500000),  # After split
        ]

        # Apply all transactions
        for tx in transactions:
            service._apply_transaction(state, tx)

        # Verify final state
        # After 2:1 split, balances should be doubled then transfer applied
        # founder1: (5000000 * 2) - 500000 = 9500000
        # founder2: (3000000 * 2) + 500000 = 6500000
        # investor1: 1000000 * 2 = 2000000
        # advisor1: 125000 * 2 = 250000
        assert state.balances["founder1"] == 9500000
        assert state.balances["founder2"] == 6500000
        assert state.balances["investor1"] == 2000000
        assert state.balances["advisor1"] == 250000

        # Total supply: (5000000 + 3000000 + 1000000 + 125000) * 2 = 18250000
        assert state.total_supply == 18250000

        # All should be approved
        assert "founder1" in state.approved_wallets
        assert "founder2" in state.approved_wallets
        assert "investor1" in state.approved_wallets

        # Vesting schedule should be updated
        assert state.vesting_schedules[1].total_amount == 1000000  # 500000 * 2
        assert state.vesting_schedules[1].released_amount == 250000  # 125000 * 2

    def _create_tx(self, tx_type, **kwargs):
        """Helper to create mock transactions."""
        tx = MagicMock()
        tx.tx_type = tx_type
        tx.wallet = kwargs.get('wallet')
        tx.wallet_to = kwargs.get('wallet_to')
        tx.amount = kwargs.get('amount')
        tx.amount_secondary = kwargs.get('amount_secondary', 0)
        tx.share_class_id = kwargs.get('share_class_id')
        tx.reference_id = kwargs.get('reference_id')
        tx.priority = kwargs.get('priority', 99)
        tx.preference_multiple = kwargs.get('preference_multiple', 1.0)
        tx.data = kwargs.get('data', {})
        return tx
