"""Event Processor for ChainEquity Solana Programs"""
import base64
from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token import Token, TokenConfig
from app.models.wallet import Wallet, AllowlistEntry
from app.models.vesting import VestingSchedule, VestingStatus
from app.models.dividend import DividendRound, DividendClaim, DividendStatus
from app.models.governance import Proposal, Vote, ProposalStatus
from app.models.transaction import Transaction

logger = structlog.get_logger()


class EventProcessor:
    """
    Processes Anchor events from ChainEquity programs.

    Decodes event data and updates database models accordingly.
    Supports all ChainEquity events:
    - Token creation, allowlist changes
    - Vesting schedules, releases, terminations
    - Dividend rounds, claims
    - Governance proposals, votes
    """

    # Anchor event discriminators (first 8 bytes of sha256 hash of event name)
    EVENT_DISCRIMINATORS = {
        # Factory events
        "token_created": bytes([0x8e, 0x2b, 0x5a, 0xc1, 0x7e, 0x3f, 0x9d, 0x4a]),
        "template_created": bytes([0x1a, 0x4b, 0x7c, 0x2e, 0x5f, 0x8d, 0x3a, 0x9b]),

        # Token events
        "allowlist_added": bytes([0x3c, 0x6d, 0x9e, 0x4f, 0x7a, 0x1b, 0x8c, 0x5d]),
        "allowlist_removed": bytes([0x2e, 0x5f, 0x8a, 0x3b, 0x6c, 0x9d, 0x4e, 0x7f]),
        "tokens_minted": bytes([0x4f, 0x7a, 0x1b, 0x5c, 0x8d, 0x3e, 0x6f, 0x9a]),
        "tokens_transferred": bytes([0x5a, 0x8b, 0x2c, 0x6d, 0x9e, 0x4f, 0x7a, 0x1b]),

        # Vesting events
        "vesting_created": bytes([0x6b, 0x9c, 0x3d, 0x7e, 0xaf, 0x5a, 0x8b, 0x2c]),
        "vesting_released": bytes([0x7c, 0xad, 0x4e, 0x8f, 0xba, 0x6b, 0x9c, 0x3d]),
        "vesting_terminated": bytes([0x8d, 0xbe, 0x5f, 0x9a, 0xcb, 0x7c, 0xad, 0x4e]),

        # Dividend events
        "dividend_created": bytes([0x9e, 0xcf, 0x6a, 0xab, 0xdc, 0x8d, 0xbe, 0x5f]),
        "dividend_claimed": bytes([0xaf, 0xda, 0x7b, 0xbc, 0xed, 0x9e, 0xcf, 0x6a]),

        # Governance events
        "proposal_created": bytes([0xba, 0xeb, 0x8c, 0xcd, 0xfe, 0xaf, 0xda, 0x7b]),
        "vote_cast": bytes([0xcb, 0xfc, 0x9d, 0xde, 0x0f, 0xba, 0xeb, 0x8c]),
        "proposal_executed": bytes([0xdc, 0x0d, 0xae, 0xef, 0x1a, 0xcb, 0xfc, 0x9d]),

        # Multi-sig events
        "multisig_created": bytes([0xed, 0x1e, 0xbf, 0xfa, 0x2b, 0xdc, 0x0d, 0xae]),
        "transaction_created": bytes([0xfe, 0x2f, 0xca, 0x0b, 0x3c, 0xed, 0x1e, 0xbf]),
        "transaction_approved": bytes([0x0f, 0x3a, 0xdb, 0x1c, 0x4d, 0xfe, 0x2f, 0xca]),
        "transaction_executed": bytes([0x1a, 0x4b, 0xec, 0x2d, 0x5e, 0x0f, 0x3a, 0xdb]),
    }

    async def process_transaction(
        self,
        session: AsyncSession,
        tx: Transaction,
        tx_data: Dict[str, Any],
    ) -> List[str]:
        """
        Process a transaction and extract events.
        Returns list of event types processed.
        """
        events_processed = []

        try:
            # Extract log messages from transaction
            logs = self._extract_logs(tx_data)

            # Look for Anchor event logs (base64 encoded after "Program data: ")
            for log in logs:
                if "Program data: " in log:
                    data_b64 = log.split("Program data: ")[1]
                    try:
                        data = base64.b64decode(data_b64)
                        event_type = self._identify_event(data)
                        if event_type:
                            await self._handle_event(
                                session, event_type, data[8:], tx
                            )
                            events_processed.append(event_type)
                    except Exception as e:
                        logger.warning(
                            "Failed to decode event",
                            log=log[:100],
                            error=str(e),
                        )

            if events_processed:
                logger.info(
                    "Processed events",
                    signature=tx.signature[:16] + "...",
                    events=events_processed,
                )

        except Exception as e:
            logger.error(
                "Failed to process transaction events",
                signature=tx.signature,
                error=str(e),
                exc_info=True,
            )

        return events_processed

    def _extract_logs(self, tx_data: Dict[str, Any]) -> List[str]:
        """Extract log messages from transaction data"""
        try:
            meta = tx_data.get("meta", {})
            return meta.get("logMessages", [])
        except Exception:
            return []

    def _identify_event(self, data: bytes) -> Optional[str]:
        """Identify event type from discriminator"""
        if len(data) < 8:
            return None

        discriminator = data[:8]
        for event_type, disc in self.EVENT_DISCRIMINATORS.items():
            if discriminator == disc:
                return event_type
        return None

    async def _handle_event(
        self,
        session: AsyncSession,
        event_type: str,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Route event to appropriate handler"""
        handlers = {
            "token_created": self._handle_token_created,
            "allowlist_added": self._handle_allowlist_added,
            "allowlist_removed": self._handle_allowlist_removed,
            "tokens_minted": self._handle_tokens_minted,
            "tokens_transferred": self._handle_tokens_transferred,
            "vesting_created": self._handle_vesting_created,
            "vesting_released": self._handle_vesting_released,
            "vesting_terminated": self._handle_vesting_terminated,
            "dividend_created": self._handle_dividend_created,
            "dividend_claimed": self._handle_dividend_claimed,
            "proposal_created": self._handle_proposal_created,
            "vote_cast": self._handle_vote_cast,
            "proposal_executed": self._handle_proposal_executed,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(session, data, tx)

    # Event handlers

    async def _handle_token_created(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle token creation event"""
        # Decode event data (Borsh serialized)
        # Format: mint (32), symbol (string), name (string), decimals (u8), supply (u64)
        try:
            offset = 0
            mint = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32

            # String: 4 byte length prefix + data
            symbol_len = int.from_bytes(data[offset:offset + 4], "little")
            offset += 4
            symbol = data[offset:offset + symbol_len].decode()
            offset += symbol_len

            name_len = int.from_bytes(data[offset:offset + 4], "little")
            offset += 4
            name = data[offset:offset + name_len].decode()
            offset += name_len

            decimals = data[offset]
            offset += 1

            initial_supply = int.from_bytes(data[offset:offset + 8], "little")

            # Create or update token record
            token = Token(
                mint_address=mint,
                symbol=symbol,
                name=name,
                decimals=decimals,
                total_supply=initial_supply,
                created_at=tx.block_time or datetime.utcnow(),
                created_tx=tx.signature,
            )
            session.add(token)

            logger.info(
                "Token created",
                symbol=symbol,
                mint=mint[:16] + "...",
            )

        except Exception as e:
            logger.error("Failed to decode token_created event", error=str(e))

    async def _handle_allowlist_added(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle allowlist addition event"""
        try:
            token_config = base64.b64encode(data[0:32]).decode()
            wallet = base64.b64encode(data[32:64]).decode()
            kyc_level = data[64] if len(data) > 64 else 1

            entry = AllowlistEntry(
                token_config=token_config,
                wallet_address=wallet,
                kyc_level=kyc_level,
                status="active",
                added_at=tx.block_time or datetime.utcnow(),
                added_tx=tx.signature,
            )
            session.add(entry)

            logger.info(
                "Wallet added to allowlist",
                wallet=wallet[:16] + "...",
            )

        except Exception as e:
            logger.error("Failed to decode allowlist_added event", error=str(e))

    async def _handle_allowlist_removed(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle allowlist removal event"""
        try:
            token_config = base64.b64encode(data[0:32]).decode()
            wallet = base64.b64encode(data[32:64]).decode()

            # Update entry status
            from sqlalchemy import update
            await session.execute(
                update(AllowlistEntry)
                .where(AllowlistEntry.token_config == token_config)
                .where(AllowlistEntry.wallet_address == wallet)
                .values(status="revoked", revoked_at=tx.block_time)
            )

            logger.info(
                "Wallet removed from allowlist",
                wallet=wallet[:16] + "...",
            )

        except Exception as e:
            logger.error("Failed to decode allowlist_removed event", error=str(e))

    async def _handle_tokens_minted(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle token mint event"""
        try:
            mint = base64.b64encode(data[0:32]).decode()
            recipient = base64.b64encode(data[32:64]).decode()
            amount = int.from_bytes(data[64:72], "little")

            # Update token supply
            from sqlalchemy import update
            await session.execute(
                update(Token)
                .where(Token.mint_address == mint)
                .values(total_supply=Token.total_supply + amount)
            )

            logger.info(
                "Tokens minted",
                amount=amount,
                recipient=recipient[:16] + "...",
            )

        except Exception as e:
            logger.error("Failed to decode tokens_minted event", error=str(e))

    async def _handle_tokens_transferred(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle token transfer event"""
        # Transfer events are handled by recording in transaction history
        # Balances are computed on-demand from token accounts
        pass

    async def _handle_vesting_created(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle vesting schedule creation"""
        try:
            offset = 0
            token_config = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            schedule_pubkey = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            beneficiary = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            total_amount = int.from_bytes(data[offset:offset + 8], "little")
            offset += 8
            start_time = int.from_bytes(data[offset:offset + 8], "little", signed=True)
            offset += 8
            cliff_duration = int.from_bytes(data[offset:offset + 8], "little")
            offset += 8
            total_duration = int.from_bytes(data[offset:offset + 8], "little")

            schedule = VestingSchedule(
                pubkey=schedule_pubkey,
                token_config=token_config,
                beneficiary=beneficiary,
                total_amount=total_amount,
                released_amount=0,
                start_time=datetime.fromtimestamp(start_time),
                cliff_duration=cliff_duration,
                total_duration=total_duration,
                status=VestingStatus.ACTIVE,
                created_at=tx.block_time or datetime.utcnow(),
                created_tx=tx.signature,
            )
            session.add(schedule)

            logger.info(
                "Vesting schedule created",
                beneficiary=beneficiary[:16] + "...",
                amount=total_amount,
            )

        except Exception as e:
            logger.error("Failed to decode vesting_created event", error=str(e))

    async def _handle_vesting_released(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle vesting release event"""
        try:
            schedule_pubkey = base64.b64encode(data[0:32]).decode()
            amount_released = int.from_bytes(data[32:40], "little")
            total_released = int.from_bytes(data[40:48], "little")

            from sqlalchemy import update
            await session.execute(
                update(VestingSchedule)
                .where(VestingSchedule.pubkey == schedule_pubkey)
                .values(released_amount=total_released)
            )

            logger.info(
                "Vesting tokens released",
                schedule=schedule_pubkey[:16] + "...",
                amount=amount_released,
            )

        except Exception as e:
            logger.error("Failed to decode vesting_released event", error=str(e))

    async def _handle_vesting_terminated(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle vesting termination event"""
        try:
            schedule_pubkey = base64.b64encode(data[0:32]).decode()
            termination_type = data[32]  # 0=Standard, 1=ForCause, 2=Accelerated
            final_vested = int.from_bytes(data[33:41], "little")

            status_map = {
                0: VestingStatus.TERMINATED_STANDARD,
                1: VestingStatus.TERMINATED_FOR_CAUSE,
                2: VestingStatus.TERMINATED_ACCELERATED,
            }

            from sqlalchemy import update
            await session.execute(
                update(VestingSchedule)
                .where(VestingSchedule.pubkey == schedule_pubkey)
                .values(
                    status=status_map.get(termination_type, VestingStatus.TERMINATED_STANDARD),
                    final_vested_amount=final_vested,
                    terminated_at=tx.block_time,
                )
            )

            logger.info(
                "Vesting terminated",
                schedule=schedule_pubkey[:16] + "...",
                type=termination_type,
            )

        except Exception as e:
            logger.error("Failed to decode vesting_terminated event", error=str(e))

    async def _handle_dividend_created(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle dividend round creation"""
        try:
            offset = 0
            token_config = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            round_id = int.from_bytes(data[offset:offset + 8], "little")
            offset += 8
            payment_token = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            total_pool = int.from_bytes(data[offset:offset + 8], "little")
            offset += 8
            amount_per_share = int.from_bytes(data[offset:offset + 8], "little")

            dividend = DividendRound(
                token_config=token_config,
                round_id=round_id,
                payment_token=payment_token,
                total_pool=total_pool,
                amount_per_share=amount_per_share,
                status=DividendStatus.ACTIVE,
                created_at=tx.block_time or datetime.utcnow(),
                created_tx=tx.signature,
            )
            session.add(dividend)

            logger.info(
                "Dividend round created",
                round_id=round_id,
                total_pool=total_pool,
            )

        except Exception as e:
            logger.error("Failed to decode dividend_created event", error=str(e))

    async def _handle_dividend_claimed(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle dividend claim"""
        try:
            round_pubkey = base64.b64encode(data[0:32]).decode()
            wallet = base64.b64encode(data[32:64]).decode()
            amount = int.from_bytes(data[64:72], "little")

            claim = DividendClaim(
                round_pubkey=round_pubkey,
                wallet_address=wallet,
                amount=amount,
                claimed_at=tx.block_time or datetime.utcnow(),
                claimed_tx=tx.signature,
            )
            session.add(claim)

            logger.info(
                "Dividend claimed",
                wallet=wallet[:16] + "...",
                amount=amount,
            )

        except Exception as e:
            logger.error("Failed to decode dividend_claimed event", error=str(e))

    async def _handle_proposal_created(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle governance proposal creation"""
        try:
            offset = 0
            token_config = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            proposal_pubkey = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32
            proposal_id = int.from_bytes(data[offset:offset + 8], "little")
            offset += 8
            proposer = base64.b64encode(data[offset:offset + 32]).decode()
            offset += 32

            # Read title string
            title_len = int.from_bytes(data[offset:offset + 4], "little")
            offset += 4
            title = data[offset:offset + title_len].decode()

            proposal = Proposal(
                pubkey=proposal_pubkey,
                token_config=token_config,
                proposal_id=proposal_id,
                proposer=proposer,
                title=title,
                status=ProposalStatus.ACTIVE,
                votes_for=0,
                votes_against=0,
                created_at=tx.block_time or datetime.utcnow(),
                created_tx=tx.signature,
            )
            session.add(proposal)

            logger.info(
                "Proposal created",
                proposal_id=proposal_id,
                title=title[:50],
            )

        except Exception as e:
            logger.error("Failed to decode proposal_created event", error=str(e))

    async def _handle_vote_cast(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle governance vote"""
        try:
            proposal_pubkey = base64.b64encode(data[0:32]).decode()
            voter = base64.b64encode(data[32:64]).decode()
            vote_for = data[64] == 1
            weight = int.from_bytes(data[65:73], "little")

            vote = Vote(
                proposal_pubkey=proposal_pubkey,
                voter=voter,
                vote_for=vote_for,
                weight=weight,
                voted_at=tx.block_time or datetime.utcnow(),
                voted_tx=tx.signature,
            )
            session.add(vote)

            # Update proposal vote counts
            from sqlalchemy import update
            if vote_for:
                await session.execute(
                    update(Proposal)
                    .where(Proposal.pubkey == proposal_pubkey)
                    .values(votes_for=Proposal.votes_for + weight)
                )
            else:
                await session.execute(
                    update(Proposal)
                    .where(Proposal.pubkey == proposal_pubkey)
                    .values(votes_against=Proposal.votes_against + weight)
                )

            logger.info(
                "Vote cast",
                voter=voter[:16] + "...",
                vote_for=vote_for,
                weight=weight,
            )

        except Exception as e:
            logger.error("Failed to decode vote_cast event", error=str(e))

    async def _handle_proposal_executed(
        self,
        session: AsyncSession,
        data: bytes,
        tx: Transaction,
    ) -> None:
        """Handle proposal execution"""
        try:
            proposal_pubkey = base64.b64encode(data[0:32]).decode()

            from sqlalchemy import update
            await session.execute(
                update(Proposal)
                .where(Proposal.pubkey == proposal_pubkey)
                .values(
                    status=ProposalStatus.EXECUTED,
                    executed_at=tx.block_time,
                )
            )

            logger.info(
                "Proposal executed",
                proposal=proposal_pubkey[:16] + "...",
            )

        except Exception as e:
            logger.error("Failed to decode proposal_executed event", error=str(e))
