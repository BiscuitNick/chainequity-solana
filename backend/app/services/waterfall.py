"""
Waterfall Calculator Service

Calculates liquidation preference distribution based on share class priorities
and preference multiples.

Supports non-participating preferred:
1. Pay liquidation preferences in priority order
2. Distribute remaining proceeds pro-rata by share count to ALL shareholders
3. Preferred shareholders take the GREATER of their preference OR their pro-rata share
"""
from typing import List, Dict, Any
from dataclasses import dataclass, field
from collections import defaultdict


@dataclass
class WaterfallPosition:
    """A holder's position for waterfall calculation"""
    wallet: str
    share_class_name: str
    priority: int
    shares: int
    cost_basis: int  # In cents
    preference_multiple: float

    @property
    def preference_amount(self) -> int:
        """Calculate liquidation preference amount (cost_basis * preference_multiple)"""
        return int(self.cost_basis * self.preference_multiple)


@dataclass
class WaterfallPayout:
    """Payout result for a single holder"""
    wallet: str
    share_class_name: str
    priority: int
    shares: int
    cost_basis: int
    preference_amount: int
    preference_multiple: float
    payout: int
    payout_source: str  # "preference", "conversion", "common", "partial_preference", or "none"


@dataclass
class WaterfallTier:
    """Results for a single priority tier"""
    priority: int
    total_preference: int
    amount_available: int
    amount_distributed: int
    fully_satisfied: bool
    payouts: List[WaterfallPayout]


@dataclass
class WaterfallResult:
    """Complete waterfall calculation result"""
    exit_amount: int
    total_shares: int
    tiers: List[WaterfallTier]
    remaining_amount: int

    def get_payout_by_wallet(self) -> Dict[str, int]:
        """Get total payout for each wallet (aggregated across tiers)"""
        payouts = defaultdict(int)
        for tier in self.tiers:
            for payout in tier.payouts:
                payouts[payout.wallet] += payout.payout
        return dict(payouts)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response"""
        return {
            "exit_amount": self.exit_amount,
            "total_shares": self.total_shares,
            "remaining_amount": self.remaining_amount,
            "tiers": [
                {
                    "priority": tier.priority,
                    "total_preference": tier.total_preference,
                    "amount_available": tier.amount_available,
                    "amount_distributed": tier.amount_distributed,
                    "fully_satisfied": tier.fully_satisfied,
                    "payouts": [
                        {
                            "wallet": p.wallet,
                            "share_class_name": p.share_class_name,
                            "priority": p.priority,
                            "shares": p.shares,
                            "cost_basis": p.cost_basis,
                            "preference_amount": p.preference_amount,
                            "preference_multiple": p.preference_multiple,
                            "payout": p.payout,
                            "payout_source": p.payout_source,
                        }
                        for p in tier.payouts
                    ],
                }
                for tier in self.tiers
            ],
            "payouts_by_wallet": self.get_payout_by_wallet(),
        }


def calculate_waterfall(
    positions: List[WaterfallPosition],
    exit_amount: int,
) -> WaterfallResult:
    """
    Calculate liquidation waterfall distribution with non-participating preferred.

    Algorithm (Non-Participating Preferred):
    1. Pay liquidation preferences in priority order (highest priority first)
    2. Remaining proceeds go pro-rata by shares to those who didn't take preference
    3. Preferred holders can choose to convert if pro-rata > preference (calculated iteratively)

    Args:
        positions: List of all share positions
        exit_amount: Total exit proceeds in cents

    Returns:
        WaterfallResult with full breakdown
    """
    if not positions:
        return WaterfallResult(
            exit_amount=exit_amount,
            total_shares=0,
            tiers=[],
            remaining_amount=exit_amount,
        )

    total_shares = sum(p.shares for p in positions)

    # Group by priority for display
    tiers_map: Dict[int, List[WaterfallPosition]] = defaultdict(list)
    for pos in positions:
        tiers_map[pos.priority].append(pos)
    sorted_priorities = sorted(tiers_map.keys())

    # Track final payouts and decisions
    final_payouts: Dict[str, tuple] = {}  # wallet -> (payout, source)

    # First, calculate total preferences
    total_all_preferences = sum(p.preference_amount for p in positions)

    # If total preferences >= exit amount, do strict waterfall by priority
    if total_all_preferences >= exit_amount:
        remaining = exit_amount
        result_tiers: List[WaterfallTier] = []

        for priority in sorted_priorities:
            tier_positions = tiers_map[priority]
            total_preference = sum(p.preference_amount for p in tier_positions)
            amount_available = remaining
            tier_payouts: List[WaterfallPayout] = []

            if remaining <= 0:
                for pos in tier_positions:
                    tier_payouts.append(WaterfallPayout(
                        wallet=pos.wallet,
                        share_class_name=pos.share_class_name,
                        priority=pos.priority,
                        shares=pos.shares,
                        cost_basis=pos.cost_basis,
                        preference_amount=pos.preference_amount,
                        preference_multiple=pos.preference_multiple,
                        payout=0,
                        payout_source="none",
                    ))
                result_tiers.append(WaterfallTier(
                    priority=priority,
                    total_preference=total_preference,
                    amount_available=0,
                    amount_distributed=0,
                    fully_satisfied=False,
                    payouts=tier_payouts,
                ))
                continue

            if remaining >= total_preference:
                for pos in tier_positions:
                    tier_payouts.append(WaterfallPayout(
                        wallet=pos.wallet,
                        share_class_name=pos.share_class_name,
                        priority=pos.priority,
                        shares=pos.shares,
                        cost_basis=pos.cost_basis,
                        preference_amount=pos.preference_amount,
                        preference_multiple=pos.preference_multiple,
                        payout=pos.preference_amount,
                        payout_source="preference",
                    ))
                amount_distributed = total_preference
                remaining -= total_preference
                fully_satisfied = True
            else:
                for pos in tier_positions:
                    if total_preference > 0:
                        share_of_remaining = pos.preference_amount / total_preference
                        payout = int(remaining * share_of_remaining)
                    else:
                        payout = 0
                    tier_payouts.append(WaterfallPayout(
                        wallet=pos.wallet,
                        share_class_name=pos.share_class_name,
                        priority=pos.priority,
                        shares=pos.shares,
                        cost_basis=pos.cost_basis,
                        preference_amount=pos.preference_amount,
                        preference_multiple=pos.preference_multiple,
                        payout=payout,
                        payout_source="partial_preference",
                    ))
                amount_distributed = remaining
                remaining = 0
                fully_satisfied = False

            result_tiers.append(WaterfallTier(
                priority=priority,
                total_preference=total_preference,
                amount_available=amount_available,
                amount_distributed=amount_distributed,
                fully_satisfied=fully_satisfied,
                payouts=tier_payouts,
            ))

        return WaterfallResult(
            exit_amount=exit_amount,
            total_shares=total_shares,
            tiers=result_tiers,
            remaining_amount=remaining,
        )

    # Exit amount exceeds total preferences
    # Now we need to determine: for each preferred holder, is it better to:
    # - Take their preference, OR
    # - Convert to common and get pro-rata share of remaining after others take preference

    # This requires iterative calculation since decisions affect each other
    # Simplified approach:
    # 1. Pay all preferences first
    # 2. Distribute remaining pro-rata to common (those with no preference)
    # 3. Check if any preferred holder would do better by converting

    remaining_after_preferences = exit_amount - total_all_preferences

    # Shares held by common (no preference)
    common_shares = sum(p.shares for p in positions if p.preference_amount == 0)
    preferred_shares = sum(p.shares for p in positions if p.preference_amount > 0)

    # For each preferred holder, calculate what they'd get by converting
    # If they convert, they give up preference and share remaining with common pro-rata
    for pos in positions:
        if pos.preference_amount > 0:
            # Option A: Take preference
            pref_payout = pos.preference_amount

            # Option B: Convert - get share of (exit_amount) based on shares
            # But only if ALL preferred convert (simplified model)
            # More accurate: their share of remaining if they alone convert
            # remaining_if_convert = exit_amount - (total_all_preferences - pos.preference_amount)
            # their_share = pos.shares / (common_shares + pos.shares)
            # convert_payout = remaining_if_convert * their_share

            # Simpler: compare preference vs pro-rata of full exit
            convert_payout = int(exit_amount * pos.shares / total_shares) if total_shares > 0 else 0

            if convert_payout > pref_payout:
                final_payouts[pos.wallet] = (convert_payout, "conversion")
            else:
                final_payouts[pos.wallet] = (pref_payout, "preference")
        else:
            # Common holder - will get pro-rata of what's left after preferences
            final_payouts[pos.wallet] = (0, "common")  # Placeholder, calculated below

    # Calculate amount taken by preferences
    pref_amount_taken = sum(
        payout for wallet, (payout, source) in final_payouts.items()
        if source == "preference"
    )

    # Calculate amount taken by conversions
    conversion_amount = sum(
        payout for wallet, (payout, source) in final_payouts.items()
        if source == "conversion"
    )

    # Remaining for common shareholders
    remaining_for_common = exit_amount - pref_amount_taken - conversion_amount

    # Shares of those who didn't take preference (common only, since converters already calculated)
    common_only_shares = sum(
        p.shares for p in positions
        if final_payouts[p.wallet][1] == "common"
    )

    # Distribute remaining to common
    for pos in positions:
        if final_payouts[pos.wallet][1] == "common":
            if common_only_shares > 0:
                payout = int(remaining_for_common * pos.shares / common_only_shares)
            else:
                payout = 0
            final_payouts[pos.wallet] = (payout, "common")

    # Build result tiers
    result_tiers: List[WaterfallTier] = []
    total_distributed = 0

    for priority in sorted_priorities:
        tier_positions = tiers_map[priority]
        total_preference = sum(p.preference_amount for p in tier_positions)
        tier_payouts: List[WaterfallPayout] = []
        tier_distributed = 0

        for pos in tier_positions:
            payout, source = final_payouts[pos.wallet]
            tier_payouts.append(WaterfallPayout(
                wallet=pos.wallet,
                share_class_name=pos.share_class_name,
                priority=pos.priority,
                shares=pos.shares,
                cost_basis=pos.cost_basis,
                preference_amount=pos.preference_amount,
                preference_multiple=pos.preference_multiple,
                payout=payout,
                payout_source=source,
            ))
            tier_distributed += payout

        total_distributed += tier_distributed

        result_tiers.append(WaterfallTier(
            priority=priority,
            total_preference=total_preference,
            amount_available=exit_amount,
            amount_distributed=tier_distributed,
            fully_satisfied=True,
            payouts=tier_payouts,
        ))

    return WaterfallResult(
        exit_amount=exit_amount,
        total_shares=total_shares,
        tiers=result_tiers,
        remaining_amount=exit_amount - total_distributed,
    )


def calculate_waterfall_scenarios(
    positions: List[WaterfallPosition],
    exit_amounts: List[int],
) -> List[WaterfallResult]:
    """
    Calculate waterfall for multiple exit scenarios.

    Useful for generating charts showing payouts at different exit values.

    Args:
        positions: List of all share positions
        exit_amounts: List of exit amounts to calculate (in cents)

    Returns:
        List of WaterfallResult, one per exit amount
    """
    return [calculate_waterfall(positions, amount) for amount in exit_amounts]
