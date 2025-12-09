"""
Dilution Calculator Service

Calculates the impact of hypothetical funding rounds on existing shareholders.
"""
from typing import List, Dict, Any
from dataclasses import dataclass


@dataclass
class CurrentHolder:
    """Current shareholder for dilution calculation"""
    wallet: str
    shares: int
    share_class_name: str
    cost_basis: int  # In cents
    ownership_pct: float


@dataclass
class SimulatedRound:
    """A hypothetical funding round"""
    name: str
    pre_money_valuation: int  # In cents
    amount_raised: int  # In cents

    @property
    def post_money_valuation(self) -> int:
        return self.pre_money_valuation + self.amount_raised


@dataclass
class DilutedPosition:
    """A holder's position after dilution"""
    wallet: str
    shares_before: int
    shares_after: int  # Same as before (existing holders don't get new shares)
    ownership_before: float
    ownership_after: float
    dilution_pct: float  # Percentage points lost
    value_before: int  # At starting valuation
    value_after: int  # At final valuation


@dataclass
class NewInvestorPosition:
    """New investor position from simulated round"""
    round_name: str
    amount_invested: int
    shares_received: int
    ownership_pct: float
    price_per_share: int


@dataclass
class DilutionResult:
    """Complete dilution simulation result"""
    rounds: List[SimulatedRound]

    # Before state
    shares_before: int
    valuation_before: int
    price_per_share_before: int

    # After state
    shares_after: int
    valuation_after: int
    price_per_share_after: int

    # Positions
    existing_holders: List[DilutedPosition]
    new_investors: List[NewInvestorPosition]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rounds": [
                {
                    "name": r.name,
                    "pre_money_valuation": r.pre_money_valuation,
                    "amount_raised": r.amount_raised,
                    "post_money_valuation": r.post_money_valuation,
                }
                for r in self.rounds
            ],
            "before": {
                "total_shares": self.shares_before,
                "valuation": self.valuation_before,
                "price_per_share": self.price_per_share_before,
            },
            "after": {
                "total_shares": self.shares_after,
                "valuation": self.valuation_after,
                "price_per_share": self.price_per_share_after,
            },
            "existing_holders": [
                {
                    "wallet": h.wallet,
                    "shares_before": h.shares_before,
                    "shares_after": h.shares_after,
                    "ownership_before": h.ownership_before,
                    "ownership_after": h.ownership_after,
                    "dilution_pct": h.dilution_pct,
                    "value_before": h.value_before,
                    "value_after": h.value_after,
                }
                for h in self.existing_holders
            ],
            "new_investors": [
                {
                    "round_name": i.round_name,
                    "amount_invested": i.amount_invested,
                    "shares_received": i.shares_received,
                    "ownership_pct": i.ownership_pct,
                    "price_per_share": i.price_per_share,
                }
                for i in self.new_investors
            ],
        }


def calculate_dilution(
    current_holders: List[CurrentHolder],
    current_valuation: int,
    simulated_rounds: List[SimulatedRound],
) -> DilutionResult:
    """
    Calculate the impact of hypothetical funding rounds on existing holders.

    Algorithm:
    1. Start with current state (shares, valuation)
    2. For each simulated round:
       a. Calculate price_per_share = pre_money_valuation / current_shares
       b. Calculate new_shares = amount_raised / price_per_share
       c. Add new_shares to total
       d. Update valuation to post_money
    3. Calculate new ownership percentages for existing holders
    4. Calculate dilution (ownership before - ownership after)

    Args:
        current_holders: List of current shareholders with their positions
        current_valuation: Current company valuation in cents
        simulated_rounds: List of hypothetical funding rounds to model

    Returns:
        DilutionResult with before/after comparison
    """
    if not current_holders:
        return DilutionResult(
            rounds=simulated_rounds,
            shares_before=0,
            valuation_before=current_valuation,
            price_per_share_before=0,
            shares_after=0,
            valuation_after=current_valuation,
            price_per_share_after=0,
            existing_holders=[],
            new_investors=[],
        )

    # Initial state
    shares_before = sum(h.shares for h in current_holders)
    price_per_share_before = current_valuation // shares_before if shares_before > 0 else 0

    # Track running totals as we process each round
    total_shares = shares_before
    running_valuation = current_valuation
    new_investors: List[NewInvestorPosition] = []

    # Process each round sequentially
    for round_info in simulated_rounds:
        # Price per share based on pre-money and current share count
        price_per_share = round_info.pre_money_valuation // total_shares if total_shares > 0 else 1
        if price_per_share <= 0:
            price_per_share = 1

        # Shares issued in this round
        new_shares = round_info.amount_raised // price_per_share

        # Add to running totals
        total_shares += new_shares
        running_valuation = round_info.post_money_valuation

        # Calculate new investor's ownership after this round
        new_ownership = (new_shares / total_shares * 100) if total_shares > 0 else 0

        new_investors.append(NewInvestorPosition(
            round_name=round_info.name,
            amount_invested=round_info.amount_raised,
            shares_received=new_shares,
            ownership_pct=round(new_ownership, 4),
            price_per_share=price_per_share,
        ))

    # Final price per share
    price_per_share_after = running_valuation // total_shares if total_shares > 0 else 0

    # Calculate diluted positions for existing holders
    diluted_holders: List[DilutedPosition] = []
    for holder in current_holders:
        # Ownership after all rounds
        ownership_after = (holder.shares / total_shares * 100) if total_shares > 0 else 0

        # Dilution = ownership lost (positive number means dilution)
        dilution = holder.ownership_pct - ownership_after

        # Value calculations
        value_before = holder.shares * price_per_share_before
        value_after = holder.shares * price_per_share_after

        diluted_holders.append(DilutedPosition(
            wallet=holder.wallet,
            shares_before=holder.shares,
            shares_after=holder.shares,  # Existing holders keep same shares
            ownership_before=holder.ownership_pct,
            ownership_after=round(ownership_after, 4),
            dilution_pct=round(dilution, 4),
            value_before=value_before,
            value_after=value_after,
        ))

    return DilutionResult(
        rounds=simulated_rounds,
        shares_before=shares_before,
        valuation_before=current_valuation,
        price_per_share_before=price_per_share_before,
        shares_after=total_shares,
        valuation_after=running_valuation,
        price_per_share_after=price_per_share_after,
        existing_holders=diluted_holders,
        new_investors=new_investors,
    )
