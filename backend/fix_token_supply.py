#!/usr/bin/env python3
"""
Migration script to fix token total_supply values that were incorrectly multiplied by 10^decimals.

The bug was in factory.py line 162:
    total_supply = request.initial_supply * (10 ** request.decimals)

This script corrects existing tokens by dividing out the decimal factor.

Usage:
    cd backend
    python fix_token_supply.py [--dry-run]

Options:
    --dry-run    Show what would be changed without making changes
"""

import asyncio
import sys
from sqlalchemy import select

# Add parent directory to path
sys.path.insert(0, ".")

from app.models.database import async_session_factory
# Import all models to ensure relationships are properly configured
from app.models import (
    Token, Wallet, Transfer, VestingSchedule, DividendRound, DividendClaim,
    Proposal, VoteRecord, CorporateAction, CapTableSnapshot,
    ShareClass, SharePosition, FundingRound, Investment, ConvertibleInstrument,
    ValuationEvent, UnifiedTransaction
)
from app.models.issuance import TokenIssuance


async def fix_token_supplies(dry_run: bool = False):
    """Fix token total_supply values that were incorrectly multiplied by decimals."""

    async with async_session_factory() as session:
        # Get all tokens
        result = await session.execute(select(Token))
        tokens = result.scalars().all()

        if not tokens:
            print("No tokens found in database.")
            return

        print(f"Found {len(tokens)} tokens to check.\n")

        fixed_count = 0
        for token in tokens:
            if token.decimals and token.decimals > 0:
                divisor = 10 ** token.decimals

                # Check if the supply looks like it was multiplied
                # (i.e., it's evenly divisible by the decimal factor)
                if token.total_supply % divisor == 0:
                    original = token.total_supply
                    corrected = token.total_supply // divisor

                    print(f"Token: {token.symbol} (ID: {token.token_id})")
                    print(f"  Decimals: {token.decimals}")
                    print(f"  Current total_supply: {original:,}")
                    print(f"  Corrected total_supply: {corrected:,}")

                    if not dry_run:
                        token.total_supply = corrected
                        print(f"  ✅ Fixed!")
                    else:
                        print(f"  [DRY RUN - no changes made]")

                    print()
                    fixed_count += 1
                else:
                    print(f"Token: {token.symbol} (ID: {token.token_id})")
                    print(f"  Decimals: {token.decimals}")
                    print(f"  total_supply: {token.total_supply:,}")
                    print(f"  ⚠️  Not evenly divisible - skipping (may already be correct)")
                    print()
            else:
                print(f"Token: {token.symbol} (ID: {token.token_id})")
                print(f"  Decimals: {token.decimals or 0}")
                print(f"  total_supply: {token.total_supply:,}")
                print(f"  ℹ️  No decimals - no fix needed")
                print()

        if not dry_run and fixed_count > 0:
            await session.commit()
            print(f"\n✅ Fixed {fixed_count} token(s).")
        elif dry_run:
            print(f"\n[DRY RUN] Would fix {fixed_count} token(s).")
        else:
            print(f"\nNo tokens needed fixing.")


def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if dry_run:
        print("=== DRY RUN MODE ===\n")
    else:
        print("=== APPLYING FIXES ===\n")

    asyncio.run(fix_token_supplies(dry_run))


if __name__ == "__main__":
    main()
