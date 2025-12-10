"""Integration tests for transaction recording and state reconstruction.

These tests use the real database to verify the full flow of:
1. Recording transactions via API endpoints
2. Reconstructing historical state from transactions
"""
import pytest
import pytest_asyncio
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token import Token
from app.models.share_class import ShareClass, SharePosition
from app.models.unified_transaction import UnifiedTransaction, TransactionType
from app.models.snapshot import CurrentBalance
from app.services.transaction_service import TransactionService


class TestTransactionRecordingIntegration:
    """Integration tests for transaction recording with real database."""

    @pytest_asyncio.fixture
    async def test_token(self, db_session: AsyncSession):
        """Create a test token with unique symbol."""
        # Generate a unique token_id using UUID to guarantee uniqueness
        import uuid
        unique_id = uuid.uuid4().int % 10000000  # Keep it within reasonable range
        # Symbol must be unique - use last 4 chars of hex UUID
        unique_symbol = f"T{uuid.uuid4().hex[:4].upper()}"  # e.g. "TA1B2" (5 chars)

        # Solana addresses are 44 characters (base58)
        token = Token(
            token_id=unique_id,
            on_chain_config=f"CFG{unique_id:07d}1111111111111111111111111111111111",  # 44 chars
            mint_address=f"MNT{unique_id:07d}1111111111111111111111111111111111",  # 44 chars
            symbol=unique_symbol,
            name=f"Test Token {unique_symbol}",
            decimals=0,
            total_supply=0,
            features={"governance_enabled": True},
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)
        return token

    @pytest_asyncio.fixture
    async def test_share_class(self, db_session: AsyncSession, test_token: Token):
        """Create a test share class."""
        share_class = ShareClass(
            token_id=test_token.token_id,
            name="Common Stock",
            symbol="COM",
            priority=1,
            preference_multiple=1.0,
        )
        db_session.add(share_class)
        await db_session.commit()
        await db_session.refresh(share_class)
        return share_class

    @pytest.mark.asyncio
    async def test_record_approval_transaction(self, db_session: AsyncSession, test_token: Token):
        """Test recording an APPROVAL transaction."""
        tx_service = TransactionService(db_session)

        # Record an approval
        tx = await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.APPROVAL,
            slot=1000,
            wallet="Wallet11111111111111111111111111111111111111",  # 44 chars
            triggered_by="admin",
            notes="Test approval",
        )
        await db_session.commit()

        # Verify transaction was recorded
        assert tx.id is not None
        assert tx.token_id == test_token.token_id
        assert tx.tx_type == TransactionType.APPROVAL
        assert tx.slot == 1000
        assert tx.wallet == "Wallet11111111111111111111111111111111111111"

        # Verify we can query it back
        result = await db_session.execute(
            select(UnifiedTransaction).where(UnifiedTransaction.id == tx.id)
        )
        saved_tx = result.scalar_one()
        assert saved_tx.tx_type == TransactionType.APPROVAL

    @pytest.mark.asyncio
    async def test_record_share_grant_transaction(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test recording a SHARE_GRANT transaction with full details."""
        tx_service = TransactionService(db_session)

        # Record a share grant
        tx = await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1001,
            wallet="Founder1111111111111111111111111111111111111",  # 44 chars
            amount=1000000,
            amount_secondary=0,  # Founding shares, no cost basis
            share_class_id=test_share_class.id,
            priority=test_share_class.priority,
            preference_multiple=test_share_class.preference_multiple,
            triggered_by="admin",
            notes="Founder share grant",
        )
        await db_session.commit()

        assert tx.amount == 1000000
        assert tx.share_class_id == test_share_class.id
        assert tx.priority == 1
        assert tx.preference_multiple == 1.0

    @pytest.mark.asyncio
    async def test_reconstruct_state_from_transactions(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test reconstructing state from a sequence of transactions."""
        tx_service = TransactionService(db_session)

        wallet1 = "Founder1111111111111111111111111111111111111"  # 44 chars
        wallet2 = "Investor111111111111111111111111111111111111"  # 44 chars

        # Record a sequence of transactions
        # Slot 1000: Approve wallet1
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.APPROVAL,
            slot=1000,
            wallet=wallet1,
        )

        # Slot 1001: Grant shares to wallet1
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1001,
            wallet=wallet1,
            amount=1000000,
            amount_secondary=0,
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
        )

        # Slot 1002: Approve wallet2
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.APPROVAL,
            slot=1002,
            wallet=wallet2,
        )

        # Slot 1003: Grant shares to wallet2
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1003,
            wallet=wallet2,
            amount=500000,
            amount_secondary=100000000,  # $1M cost basis in cents
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
        )

        # Slot 1004: Transfer some shares from wallet1 to wallet2
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.TRANSFER,
            slot=1004,
            wallet=wallet1,
            wallet_to=wallet2,
            amount=100000,
        )

        await db_session.commit()

        # Reconstruct state at slot 1001 (only wallet1 has shares)
        state_1001 = await tx_service.reconstruct_at_slot(test_token.token_id, 1001)
        assert wallet1 in state_1001.approved_wallets
        assert wallet2 not in state_1001.approved_wallets
        assert state_1001.balances.get(wallet1, 0) == 1000000
        assert state_1001.balances.get(wallet2, 0) == 0
        assert state_1001.total_supply == 1000000

        # Reconstruct state at slot 1003 (both have shares, no transfer yet)
        state_1003 = await tx_service.reconstruct_at_slot(test_token.token_id, 1003)
        assert wallet1 in state_1003.approved_wallets
        assert wallet2 in state_1003.approved_wallets
        assert state_1003.balances[wallet1] == 1000000
        assert state_1003.balances[wallet2] == 500000
        assert state_1003.total_supply == 1500000

        # Reconstruct state at slot 1004 (after transfer)
        state_1004 = await tx_service.reconstruct_at_slot(test_token.token_id, 1004)
        assert state_1004.balances[wallet1] == 900000  # 1M - 100K
        assert state_1004.balances[wallet2] == 600000  # 500K + 100K
        assert state_1004.total_supply == 1500000  # Unchanged

    @pytest.mark.asyncio
    async def test_stock_split_reconstruction(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test that stock splits are properly applied during reconstruction."""
        tx_service = TransactionService(db_session)

        wallet1 = "Holder11111111111111111111111111111111111111"  # 44 chars

        # Initial share grant
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1000,
            wallet=wallet1,
            amount=1000,
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
        )

        # 2:1 stock split
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.STOCK_SPLIT,
            slot=1001,
            data={"numerator": 2, "denominator": 1},
        )

        await db_session.commit()

        # Before split
        state_1000 = await tx_service.reconstruct_at_slot(test_token.token_id, 1000)
        assert state_1000.balances[wallet1] == 1000
        assert state_1000.total_supply == 1000

        # After split
        state_1001 = await tx_service.reconstruct_at_slot(test_token.token_id, 1001)
        assert state_1001.balances[wallet1] == 2000
        assert state_1001.total_supply == 2000

    @pytest.mark.asyncio
    async def test_governance_transactions(
        self, db_session: AsyncSession, test_token: Token
    ):
        """Test recording governance-related transactions."""
        tx_service = TransactionService(db_session)

        proposer = "Proposer111111111111111111111111111111111111"  # 44 chars
        voter = "Voter111111111111111111111111111111111111111"  # 44 chars

        # Create proposal
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.PROPOSAL_CREATE,
            slot=1000,
            wallet=proposer,
            reference_id=1,
            reference_type="proposal",
            data={
                "proposal_number": 1,
                "action_type": "stock_split",
                "description": "2:1 split",
            },
        )

        # Vote on proposal
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.VOTE,
            slot=1001,
            wallet=voter,
            amount=1000,  # vote weight
            reference_id=1,
            reference_type="proposal",
            data={
                "proposal_number": 1,
                "vote": "for",
                "vote_weight": 1000,
            },
        )

        # Execute proposal
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.PROPOSAL_EXECUTE,
            slot=1002,
            reference_id=1,
            reference_type="proposal",
            data={
                "proposal_number": 1,
                "action_type": "stock_split",
                "votes_for": 1000,
                "votes_against": 0,
            },
        )

        await db_session.commit()

        # Verify all transactions were recorded
        result = await db_session.execute(
            select(UnifiedTransaction)
            .where(UnifiedTransaction.token_id == test_token.token_id)
            .order_by(UnifiedTransaction.slot)
        )
        txs = result.scalars().all()

        assert len(txs) == 3
        assert txs[0].tx_type == TransactionType.PROPOSAL_CREATE
        assert txs[1].tx_type == TransactionType.VOTE
        assert txs[2].tx_type == TransactionType.PROPOSAL_EXECUTE

    @pytest.mark.asyncio
    async def test_get_activity_feed(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test getting activity feed."""
        tx_service = TransactionService(db_session)

        # Record various transactions
        for i in range(5):
            await tx_service.record(
                token_id=test_token.token_id,
                tx_type=TransactionType.APPROVAL,
                slot=1000 + i,
                wallet=f"Wallet{i}1111111111111111111111111111111111111",
            )

        await db_session.commit()

        # Get activity
        activity = await tx_service.get_activity(test_token.token_id, limit=10)

        assert len(activity) == 5
        # Should be in reverse slot order
        assert activity[0].slot == 1004
        assert activity[4].slot == 1000

    @pytest.mark.asyncio
    async def test_get_wallet_activity(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test getting wallet-specific activity."""
        tx_service = TransactionService(db_session)

        wallet1 = "Target11111111111111111111111111111111111111"  # 44 chars
        wallet2 = "Other111111111111111111111111111111111111111"  # 44 chars

        # Transactions for wallet1
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.APPROVAL,
            slot=1000,
            wallet=wallet1,
        )
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1001,
            wallet=wallet1,
            amount=1000,
            share_class_id=test_share_class.id,
        )

        # Transaction for wallet2
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.APPROVAL,
            slot=1002,
            wallet=wallet2,
        )

        # Transfer involving wallet1 as recipient
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.TRANSFER,
            slot=1003,
            wallet=wallet2,
            wallet_to=wallet1,
            amount=500,
        )

        await db_session.commit()

        # Get wallet1's activity (should include transfer where they're recipient)
        wallet1_activity = await tx_service.get_wallet_activity(
            wallet=wallet1, token_id=test_token.token_id
        )

        assert len(wallet1_activity) == 3  # approval, grant, transfer (as recipient)

        # Get wallet2's activity
        wallet2_activity = await tx_service.get_wallet_activity(
            wallet=wallet2, token_id=test_token.token_id
        )

        assert len(wallet2_activity) == 2  # approval, transfer (as sender)

    @pytest.mark.asyncio
    async def test_vesting_reconstruction(
        self, db_session: AsyncSession, test_token: Token, test_share_class: ShareClass
    ):
        """Test vesting schedule and release reconstruction."""
        tx_service = TransactionService(db_session)

        beneficiary = "Employ11111111111111111111111111111111111111"  # 44 chars

        # Create vesting schedule
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.VESTING_SCHEDULE_CREATE,
            slot=1000,
            wallet=beneficiary,
            reference_id=1,
            amount=100000,  # 100K shares
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
            data={
                "start_time": "2024-01-01T00:00:00",
                "duration_seconds": 31536000,
                "cliff_seconds": 7884000,
                "vesting_type": "cliff_then_linear",
            },
        )

        # First vesting release (cliff)
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.VESTING_RELEASE,
            slot=1001,
            wallet=beneficiary,
            reference_id=1,
            amount=25000,  # 25K shares
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
        )

        # Second vesting release
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.VESTING_RELEASE,
            slot=1002,
            wallet=beneficiary,
            reference_id=1,
            amount=25000,  # Another 25K shares
            share_class_id=test_share_class.id,
            priority=1,
            preference_multiple=1.0,
        )

        await db_session.commit()

        # Reconstruct at slot 1000 (schedule created, no releases)
        state_1000 = await tx_service.reconstruct_at_slot(test_token.token_id, 1000)
        assert 1 in state_1000.vesting_schedules
        assert state_1000.vesting_schedules[1].total_amount == 100000
        assert state_1000.vesting_schedules[1].released_amount == 0
        assert state_1000.balances.get(beneficiary, 0) == 0

        # Reconstruct at slot 1001 (first release)
        state_1001 = await tx_service.reconstruct_at_slot(test_token.token_id, 1001)
        assert state_1001.vesting_schedules[1].released_amount == 25000
        assert state_1001.balances[beneficiary] == 25000
        assert state_1001.total_supply == 25000

        # Reconstruct at slot 1002 (second release)
        state_1002 = await tx_service.reconstruct_at_slot(test_token.token_id, 1002)
        assert state_1002.vesting_schedules[1].released_amount == 50000
        assert state_1002.balances[beneficiary] == 50000
        assert state_1002.total_supply == 50000

    @pytest.mark.asyncio
    async def test_multiple_share_classes(
        self, db_session: AsyncSession, test_token: Token
    ):
        """Test reconstruction with multiple share classes."""
        # Create two share classes
        common = ShareClass(
            token_id=test_token.token_id,
            name="Common Stock",
            symbol="COM",
            priority=2,
            preference_multiple=1.0,
        )
        preferred = ShareClass(
            token_id=test_token.token_id,
            name="Series A Preferred",
            symbol="SAPA",
            priority=1,
            preference_multiple=1.5,
        )
        db_session.add_all([common, preferred])
        await db_session.commit()
        await db_session.refresh(common)
        await db_session.refresh(preferred)

        tx_service = TransactionService(db_session)

        founder = "Founder1111111111111111111111111111111111111"  # 44 chars
        investor = "Investor111111111111111111111111111111111111"  # 44 chars

        # Founder gets common shares
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1000,
            wallet=founder,
            amount=1000000,
            share_class_id=common.id,
            priority=common.priority,
            preference_multiple=common.preference_multiple,
        )

        # Investor gets preferred shares
        await tx_service.record(
            token_id=test_token.token_id,
            tx_type=TransactionType.SHARE_GRANT,
            slot=1001,
            wallet=investor,
            amount=500000,
            amount_secondary=500000000,  # $5M cost basis
            share_class_id=preferred.id,
            priority=preferred.priority,
            preference_multiple=preferred.preference_multiple,
        )

        await db_session.commit()

        # Reconstruct state
        state = await tx_service.reconstruct_at_slot(test_token.token_id, 1001)

        # Check positions by share class
        founder_common = state.positions.get((founder, common.id))
        investor_preferred = state.positions.get((investor, preferred.id))

        assert founder_common is not None
        assert founder_common.shares == 1000000
        assert founder_common.priority == 2
        assert founder_common.preference_multiple == 1.0

        assert investor_preferred is not None
        assert investor_preferred.shares == 500000
        assert investor_preferred.cost_basis == 500000000
        assert investor_preferred.priority == 1
        assert investor_preferred.preference_multiple == 1.5

        # Total supply should be sum of all shares
        assert state.total_supply == 1500000
