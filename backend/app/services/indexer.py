"""Solana Transaction Indexer for ChainEquity"""
import asyncio
from typing import Optional, Dict, Any, Set
from datetime import datetime
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.solana_client import SolanaClient, get_solana_client
from app.services.event_processor import EventProcessor
from app.models.database import async_session_maker
from app.models.transaction import Transaction, TransactionStatus

logger = structlog.get_logger()
settings = get_settings()


class TransactionIndexer:
    """
    Indexes Solana transactions for ChainEquity programs.

    Features:
    - Polls for new transactions on program addresses
    - Processes and decodes Anchor events
    - Stores transaction data in PostgreSQL
    - Handles reconnection and error recovery
    """

    def __init__(
        self,
        solana_client: Optional[SolanaClient] = None,
        poll_interval: float = 2.0,
        batch_size: int = 100,
    ):
        self._client = solana_client
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.event_processor = EventProcessor()
        self._running = False
        self._last_signatures: Dict[str, Optional[str]] = {}
        self._processed_signatures: Set[str] = set()

    @property
    async def client(self) -> SolanaClient:
        """Get Solana client"""
        if self._client is None:
            self._client = await get_solana_client()
        return self._client

    async def start(self) -> None:
        """Start the indexer"""
        if self._running:
            logger.warning("Indexer already running")
            return

        self._running = True
        logger.info("Starting transaction indexer", poll_interval=self.poll_interval)

        # Start polling tasks for each program
        await asyncio.gather(
            self._poll_program("factory"),
            self._poll_program("token"),
            self._poll_program("governance"),
        )

    async def stop(self) -> None:
        """Stop the indexer"""
        self._running = False
        logger.info("Stopping transaction indexer")

    async def _poll_program(self, program_name: str) -> None:
        """Poll a program for new transactions"""
        client = await self.client
        program_id = getattr(client.program_addresses, program_name)

        logger.info(f"Starting to poll {program_name} program", address=str(program_id))

        while self._running:
            try:
                # Get recent signatures
                last_sig = self._last_signatures.get(program_name)
                signatures = await client.get_signatures_for_address(
                    program_id,
                    until=last_sig,
                    limit=self.batch_size,
                )

                if signatures:
                    # Process in reverse (oldest first)
                    for sig_info in reversed(signatures):
                        sig = sig_info["signature"]

                        # Skip if already processed
                        if sig in self._processed_signatures:
                            continue

                        # Skip failed transactions
                        if sig_info.get("err"):
                            self._processed_signatures.add(sig)
                            continue

                        await self._process_transaction(program_name, sig_info)
                        self._processed_signatures.add(sig)

                    # Update last signature
                    self._last_signatures[program_name] = signatures[0]["signature"]

                    # Keep processed set bounded
                    if len(self._processed_signatures) > 10000:
                        # Remove oldest entries
                        self._processed_signatures = set(
                            list(self._processed_signatures)[-5000:]
                        )

            except Exception as e:
                logger.error(
                    f"Error polling {program_name}",
                    error=str(e),
                    exc_info=True,
                )

            await asyncio.sleep(self.poll_interval)

    async def _process_transaction(
        self,
        program_name: str,
        sig_info: Dict[str, Any],
    ) -> None:
        """Process a single transaction"""
        signature = sig_info["signature"]
        client = await self.client

        try:
            # Fetch full transaction
            tx_data = await client.get_transaction(signature)
            if tx_data is None:
                logger.warning("Transaction not found", signature=signature)
                return

            # Parse and store transaction
            async with async_session_maker() as session:
                # Check if already stored
                existing = await session.get(Transaction, signature)
                if existing:
                    return

                # Create transaction record
                tx = Transaction(
                    signature=signature,
                    program=program_name,
                    slot=sig_info["slot"],
                    block_time=datetime.fromtimestamp(sig_info["block_time"])
                    if sig_info.get("block_time")
                    else None,
                    status=TransactionStatus.CONFIRMED,
                    raw_data=tx_data,
                )

                session.add(tx)
                await session.commit()

                logger.debug(
                    "Indexed transaction",
                    signature=signature[:16] + "...",
                    program=program_name,
                    slot=sig_info["slot"],
                )

                # Process events
                await self.event_processor.process_transaction(
                    session,
                    tx,
                    tx_data,
                )

        except Exception as e:
            logger.error(
                "Failed to process transaction",
                signature=signature,
                error=str(e),
                exc_info=True,
            )

    async def backfill(
        self,
        program_name: str,
        from_slot: Optional[int] = None,
        to_slot: Optional[int] = None,
        max_transactions: int = 10000,
    ) -> int:
        """
        Backfill historical transactions for a program.
        Returns number of transactions processed.
        """
        client = await self.client
        program_id = getattr(client.program_addresses, program_name)

        logger.info(
            f"Starting backfill for {program_name}",
            from_slot=from_slot,
            to_slot=to_slot,
        )

        processed = 0
        before = None

        while processed < max_transactions:
            signatures = await client.get_signatures_for_address(
                program_id,
                before=before,
                limit=min(self.batch_size, max_transactions - processed),
            )

            if not signatures:
                break

            for sig_info in signatures:
                # Check slot bounds
                if from_slot and sig_info["slot"] < from_slot:
                    return processed
                if to_slot and sig_info["slot"] > to_slot:
                    continue

                if sig_info["signature"] not in self._processed_signatures:
                    await self._process_transaction(program_name, sig_info)
                    self._processed_signatures.add(sig_info["signature"])
                    processed += 1

            before = signatures[-1]["signature"]

        logger.info(f"Backfill complete for {program_name}", processed=processed)
        return processed

    async def get_sync_status(self) -> Dict[str, Any]:
        """Get indexer sync status"""
        client = await self.client
        current_slot = await client.get_slot()

        return {
            "running": self._running,
            "current_slot": current_slot,
            "last_signatures": self._last_signatures,
            "processed_count": len(self._processed_signatures),
        }


# Singleton indexer
_indexer: Optional[TransactionIndexer] = None


async def get_indexer() -> TransactionIndexer:
    """Get or create indexer singleton"""
    global _indexer
    if _indexer is None:
        _indexer = TransactionIndexer()
    return _indexer


async def start_indexer() -> None:
    """Start the indexer (called from main app lifespan)"""
    indexer = await get_indexer()
    asyncio.create_task(indexer.start())


async def stop_indexer() -> None:
    """Stop the indexer"""
    global _indexer
    if _indexer is not None:
        await _indexer.stop()
        _indexer = None
