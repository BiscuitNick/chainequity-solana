"""Vesting scheduler for recording explicit vesting release events."""
import asyncio
from datetime import datetime
from typing import Optional

import structlog
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import async_session_factory
from app.models.vesting import VestingSchedule
from app.models.token import Token
from app.models.unified_transaction import TransactionType
from app.services.transaction_service import TransactionService
from app.services.solana_client import get_solana_client

logger = structlog.get_logger()


class VestingScheduler:
    """
    Background scheduler that records explicit VESTING_RELEASE transactions.

    Instead of calculating vesting on-the-fly, this scheduler runs at configured
    intervals and records explicit release events for any newly vested shares.
    This enables accurate historical reconstruction at any slot.
    """

    def __init__(self, interval_seconds: int = 60):
        """
        Initialize the vesting scheduler.

        Args:
            interval_seconds: How often to check for vesting releases (default: 60s)
        """
        self.interval_seconds = interval_seconds
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the background vesting scheduler."""
        if self._running:
            logger.warning("Vesting scheduler already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Vesting scheduler started", interval_seconds=self.interval_seconds)

    async def stop(self):
        """Stop the background vesting scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Vesting scheduler stopped")

    async def _run_loop(self):
        """Main scheduler loop."""
        while self._running:
            try:
                await self.process_all_vesting_releases()
            except Exception as e:
                logger.error("Error in vesting scheduler", error=str(e))

            await asyncio.sleep(self.interval_seconds)

    async def process_all_vesting_releases(self):
        """
        Process vesting releases for all active schedules across all tokens.
        """
        async with async_session_factory() as db:
            # Get all tokens with vesting enabled
            result = await db.execute(
                select(Token).where(Token.features["vesting_enabled"].as_boolean() == True)
            )
            tokens = result.scalars().all()

            for token in tokens:
                try:
                    await self.process_token_vesting_releases(db, token.token_id)
                except Exception as e:
                    logger.error(
                        "Error processing vesting for token",
                        token_id=token.token_id,
                        error=str(e)
                    )

            await db.commit()

    async def process_token_vesting_releases(
        self,
        db: AsyncSession,
        token_id: int,
    ):
        """
        Process vesting releases for all active schedules of a specific token.

        Args:
            db: Database session
            token_id: Token to process vesting for
        """
        # Get current slot
        try:
            solana_client = await get_solana_client()
            current_slot = await solana_client.get_slot()
        except Exception:
            current_slot = 0

        current_time = datetime.utcnow()

        # Get the token for updating total_supply
        token_result = await db.execute(
            select(Token).where(Token.token_id == token_id)
        )
        token = token_result.scalar_one_or_none()
        if not token:
            logger.warning("Token not found for vesting release", token_id=token_id)
            return

        # Get all active (non-terminated) vesting schedules for this token
        result = await db.execute(
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.share_class))
            .where(
                and_(
                    VestingSchedule.token_id == token_id,
                    VestingSchedule.termination_type.is_(None),  # Not terminated
                )
            )
        )
        schedules = result.scalars().all()

        tx_service = TransactionService(db)
        releases_recorded = 0
        total_newly_vested = 0

        for schedule in schedules:
            # Calculate new releasable intervals
            new_intervals = schedule.calculate_releasable_intervals(current_time)

            if new_intervals > 0:
                # Calculate release amount for these intervals
                total_intervals = schedule.total_intervals()
                amount_per = schedule.amount_per_interval()
                remainder = schedule.remainder()

                previous_intervals = schedule.intervals_released or 0
                new_total_intervals = previous_intervals + new_intervals

                # Base release for new intervals
                release_amount = amount_per * new_intervals

                # Add remainder shares for final intervals
                remainder_start = total_intervals - remainder
                if new_total_intervals > remainder_start and previous_intervals < total_intervals:
                    remainder_intervals_before = max(0, previous_intervals - remainder_start) if previous_intervals > remainder_start else 0
                    remainder_intervals_now = min(new_total_intervals - remainder_start, remainder) if new_total_intervals > remainder_start else 0
                    release_amount += remainder_intervals_now - remainder_intervals_before

                if release_amount > 0:
                    # Record explicit VESTING_RELEASE transaction
                    await tx_service.record(
                        token_id=token_id,
                        tx_type=TransactionType.VESTING_RELEASE,
                        slot=current_slot,
                        wallet=schedule.beneficiary,
                        amount=release_amount,
                        share_class_id=None,  # Vesting is always common
                        priority=99,  # Common stock priority
                        preference_multiple=1.0,  # No preference
                        price_per_share=schedule.price_per_share,
                        reference_id=schedule.id,
                        reference_type="vesting_schedule",
                        triggered_by="vesting_scheduler",
                        data={
                            "intervals_released": new_intervals,
                            "total_intervals_released": new_total_intervals,
                            "total_intervals": total_intervals,
                            "amount_per_interval": amount_per,
                            "total_released": schedule.released_amount + release_amount,
                            "total_amount": schedule.total_amount,
                            "schedule_address": schedule.on_chain_address,
                        },
                    )

                    # Update the schedule's state
                    schedule.intervals_released = new_total_intervals
                    schedule.released_amount += release_amount

                    releases_recorded += 1
                    total_newly_vested += release_amount

                    logger.debug(
                        "Recorded vesting release",
                        token_id=token_id,
                        schedule_id=schedule.id,
                        beneficiary=schedule.beneficiary,
                        amount=release_amount,
                        intervals=new_intervals,
                        slot=current_slot,
                    )

        # Update token total_supply with all newly vested shares
        if total_newly_vested > 0:
            token.total_supply = (token.total_supply or 0) + total_newly_vested

        if releases_recorded > 0:
            logger.info(
                "Processed vesting releases",
                token_id=token_id,
                releases_recorded=releases_recorded,
                total_newly_vested=total_newly_vested,
                slot=current_slot,
            )


# Singleton instance
_scheduler: Optional[VestingScheduler] = None


def get_vesting_scheduler(interval_seconds: int = 60) -> VestingScheduler:
    """Get or create the singleton vesting scheduler."""
    global _scheduler
    if _scheduler is None:
        _scheduler = VestingScheduler(interval_seconds=interval_seconds)
    return _scheduler


async def start_vesting_scheduler(interval_seconds: int = 60):
    """Start the vesting scheduler."""
    scheduler = get_vesting_scheduler(interval_seconds)
    await scheduler.start()


async def stop_vesting_scheduler():
    """Stop the vesting scheduler."""
    global _scheduler
    if _scheduler:
        await _scheduler.stop()
        _scheduler = None
