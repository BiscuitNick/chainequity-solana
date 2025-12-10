"""Simulator API endpoints for waterfall and dilution calculations"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.token import Token
from app.models.share_class import ShareClass, SharePosition
from app.services.waterfall import (
    WaterfallPosition,
    calculate_waterfall,
    calculate_waterfall_scenarios,
)
from app.services.dilution import (
    CurrentHolder,
    SimulatedRound,
    calculate_dilution,
)
from app.schemas.investment import (
    WaterfallRequest,
    WaterfallScenariosRequest,
    WaterfallResponse,
    WaterfallTierResponse,
    WaterfallPayoutResponse,
    DilutionRequest,
    DilutionResponse,
    DilutedPositionResponse,
    NewInvestorResponse,
)

router = APIRouter()


async def _get_waterfall_positions(token_id: int, db: AsyncSession) -> List[WaterfallPosition]:
    """Get all share positions formatted for waterfall calculation using transaction reconstruction"""
    from app.services.solana_client import get_solana_client
    from app.services.transaction_service import TransactionService

    # Get current slot and reconstruct state from transactions
    solana_client = await get_solana_client()
    current_slot = await solana_client.get_slot()

    tx_service = TransactionService(db)
    state = await tx_service.reconstruct_at_slot(token_id, current_slot)

    # Get share class info for names
    result = await db.execute(
        select(ShareClass).where(ShareClass.token_id == token_id)
    )
    share_classes = {sc.id: sc for sc in result.scalars().all()}

    positions = []
    for (wallet, class_id), pos_state in state.positions.items():
        if pos_state.shares > 0:
            sc = share_classes.get(class_id)
            if sc:
                positions.append(WaterfallPosition(
                    wallet=wallet,
                    share_class_name=sc.name,
                    priority=pos_state.priority,
                    shares=pos_state.shares,
                    cost_basis=pos_state.cost_basis,
                    preference_multiple=pos_state.preference_multiple,
                ))

    return positions


def _build_waterfall_response(result) -> WaterfallResponse:
    """Convert waterfall result to response schema"""
    return WaterfallResponse(
        exit_amount=result.exit_amount,
        total_shares=result.total_shares,
        remaining_amount=result.remaining_amount,
        tiers=[
            WaterfallTierResponse(
                priority=tier.priority,
                total_preference=tier.total_preference,
                amount_available=tier.amount_available,
                amount_distributed=tier.amount_distributed,
                fully_satisfied=tier.fully_satisfied,
                payouts=[
                    WaterfallPayoutResponse(
                        wallet=p.wallet,
                        share_class_name=p.share_class_name,
                        priority=p.priority,
                        shares=p.shares,
                        cost_basis=p.cost_basis,
                        preference_amount=p.preference_amount,
                        preference_multiple=p.preference_multiple,
                        payout=p.payout,
                        payout_source=p.payout_source,
                    )
                    for p in tier.payouts
                ],
            )
            for tier in result.tiers
        ],
        payouts_by_wallet=result.get_payout_by_wallet(),
    )


@router.post("/waterfall", response_model=WaterfallResponse)
async def simulate_waterfall(
    request: WaterfallRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate liquidation waterfall for a given exit amount.

    This calculates how proceeds would be distributed based on:
    - Share class priorities (lower number = higher priority, paid first)
    - Liquidation preference multiples (1x, 2x, etc.)
    - Pro-rata distribution within same priority tier when insufficient funds

    Example:
    - Debt holder (priority 0, 1x on $500K) gets paid first
    - Series A investor (priority 1, 2x on $1M) gets $2M before lower tiers
    - Common stockholders (priority 99, 1x) get what's left

    This does NOT modify any data - purely a simulation.
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate exit amount
    if request.exit_amount < 0:
        raise HTTPException(status_code=400, detail="Exit amount must be non-negative")

    # Get positions
    positions = await _get_waterfall_positions(token_id, db)

    if not positions:
        raise HTTPException(status_code=400, detail="No share positions found. Create share classes and issue shares first.")

    # Calculate waterfall
    result = calculate_waterfall(positions, request.exit_amount)

    return _build_waterfall_response(result)


@router.post("/waterfall/scenarios")
async def simulate_waterfall_scenarios(
    request: WaterfallScenariosRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate waterfall for multiple exit amounts.

    Useful for generating charts showing how payouts change at different exit values.

    Example use case: Show payouts at $1M, $5M, $10M, $50M exits
    """
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Validate
    if not request.exit_amounts:
        raise HTTPException(status_code=400, detail="At least one exit amount required")

    if any(amount < 0 for amount in request.exit_amounts):
        raise HTTPException(status_code=400, detail="Exit amounts must be non-negative")

    # Get positions
    positions = await _get_waterfall_positions(token_id, db)

    if not positions:
        raise HTTPException(status_code=400, detail="No share positions found. Create share classes and issue shares first.")

    # Calculate scenarios
    results = calculate_waterfall_scenarios(positions, request.exit_amounts)

    return {
        "scenarios": [_build_waterfall_response(r).model_dump() for r in results]
    }


@router.post("/dilution", response_model=DilutionResponse)
async def simulate_dilution(
    request: DilutionRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate the dilution impact of hypothetical funding rounds.

    This does NOT modify any data - it's purely a "what-if" calculation.

    Shows for each existing holder:
    - Ownership percentage before and after
    - Dilution (percentage points lost)
    - Dollar value before and after (may go UP even with dilution if valuation increases)

    Shows for new investors:
    - Shares received
    - Ownership percentage
    - Price per share

    Example: Simulate raising $5M at $20M pre-money to see impact on founders.
    """
    # Verify token exists and get current valuation
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    current_valuation = token.current_valuation or 0
    if current_valuation <= 0:
        raise HTTPException(
            status_code=400,
            detail="Token has no current valuation. Set a valuation first using POST /valuations."
        )

    # Validate rounds
    if not request.rounds:
        raise HTTPException(status_code=400, detail="At least one round required")

    for r in request.rounds:
        if r.pre_money_valuation <= 0:
            raise HTTPException(status_code=400, detail=f"Round '{r.name}' has invalid pre-money valuation")
        if r.amount_raised <= 0:
            raise HTTPException(status_code=400, detail=f"Round '{r.name}' has invalid amount raised")

    # Get current holders from share positions
    positions = await _get_waterfall_positions(token_id, db)

    if not positions:
        raise HTTPException(status_code=400, detail="No share positions found. Issue shares first.")

    total_shares = sum(p.shares for p in positions)

    current_holders = [
        CurrentHolder(
            wallet=p.wallet,
            shares=p.shares,
            share_class_name=p.share_class_name,
            cost_basis=p.cost_basis,
            ownership_pct=round((p.shares / total_shares * 100), 4) if total_shares > 0 else 0,
        )
        for p in positions
    ]

    # Build simulated rounds
    simulated_rounds = [
        SimulatedRound(
            name=r.name,
            pre_money_valuation=r.pre_money_valuation,
            amount_raised=r.amount_raised,
        )
        for r in request.rounds
    ]

    # Calculate dilution
    result = calculate_dilution(current_holders, current_valuation, simulated_rounds)

    return DilutionResponse(
        rounds=[
            {
                "name": r.name,
                "pre_money_valuation": r.pre_money_valuation,
                "amount_raised": r.amount_raised,
                "post_money_valuation": r.post_money_valuation,
            }
            for r in result.rounds
        ],
        before={
            "total_shares": result.shares_before,
            "valuation": result.valuation_before,
            "price_per_share": result.price_per_share_before,
        },
        after={
            "total_shares": result.shares_after,
            "valuation": result.valuation_after,
            "price_per_share": result.price_per_share_after,
        },
        existing_holders=[
            DilutedPositionResponse(
                wallet=h.wallet,
                shares_before=h.shares_before,
                shares_after=h.shares_after,
                ownership_before=h.ownership_before,
                ownership_after=h.ownership_after,
                dilution_pct=h.dilution_pct,
                value_before=h.value_before,
                value_after=h.value_after,
            )
            for h in result.existing_holders
        ],
        new_investors=[
            NewInvestorResponse(
                round_name=i.round_name,
                amount_invested=i.amount_invested,
                shares_received=i.shares_received,
                ownership_pct=i.ownership_pct,
                price_per_share=i.price_per_share,
            )
            for i in result.new_investors
        ],
    )
