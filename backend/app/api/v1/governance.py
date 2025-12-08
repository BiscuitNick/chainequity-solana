"""Governance API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime, timedelta

from app.models.database import get_db
from app.models.governance import Proposal, VoteRecord
import uuid
from app.models.token import Token
from app.models.snapshot import CurrentBalance
from app.schemas.governance import (
    ProposalResponse,
    CreateProposalRequest,
    VoteRequest,
    VotingPowerResponse,
)
from app.services.solana_client import get_solana_client
from solders.pubkey import Pubkey

router = APIRouter()


def _proposal_to_response(p: Proposal) -> ProposalResponse:
    """Convert Proposal model to response schema"""
    now = datetime.utcnow()
    quorum_threshold = 10  # 10% quorum requirement
    approval_threshold = 50  # 50% approval requirement

    # Calculate quorum and approval
    total_votes = p.votes_for + p.votes_against + p.votes_abstain
    quorum_reached = total_votes >= quorum_threshold

    total_decisive = p.votes_for + p.votes_against
    approval_reached = total_decisive > 0 and (p.votes_for / total_decisive * 100) >= approval_threshold

    # Can execute if passed, after execution delay, and not yet executed
    can_execute = (
        p.status == "passed" and
        p.executed_at is None and
        now >= p.voting_ends
    )

    return ProposalResponse(
        id=p.id,
        proposal_number=p.proposal_number,
        proposer=p.proposer,
        action_type=p.action_type,
        action_data=p.action_data,
        description=p.description,
        votes_for=p.votes_for,
        votes_against=p.votes_against,
        votes_abstain=p.votes_abstain,
        status=p.status,
        voting_starts=p.voting_starts,
        voting_ends=p.voting_ends,
        executed_at=p.executed_at,
        quorum_reached=quorum_reached,
        approval_reached=approval_reached,
        can_execute=can_execute,
    )


@router.get("/proposals", response_model=List[ProposalResponse])
async def list_proposals(token_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """List all governance proposals"""
    result = await db.execute(
        select(Proposal)
        .where(Proposal.token_id == token_id)
        .order_by(Proposal.proposal_number.desc())
    )
    proposals = result.scalars().all()

    return [_proposal_to_response(p) for p in proposals]


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(token_id: int = Path(...), proposal_id: int = Path(...), db: AsyncSession = Depends(get_db)):
    """Get a specific proposal"""
    result = await db.execute(
        select(Proposal).where(
            Proposal.token_id == token_id,
            Proposal.id == proposal_id
        )
    )
    proposal = result.scalar_one_or_none()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return _proposal_to_response(proposal)


@router.post("/proposals")
async def create_proposal(
    request: CreateProposalRequest,
    token_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new proposal and save to database"""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Check governance is enabled
    features = token.features or {}
    if not features.get("governance_enabled", True):  # Default True for legacy tokens
        raise HTTPException(status_code=400, detail="Governance is not enabled for this token")

    # Get next proposal number
    result = await db.execute(
        select(func.max(Proposal.proposal_number)).where(Proposal.token_id == token_id)
    )
    max_num = result.scalar() or 0
    next_num = max_num + 1

    # Calculate voting period
    now = datetime.utcnow()
    if request.voting_period_minutes:
        # Demo mode: use minutes for quick testing
        voting_ends = now + timedelta(minutes=request.voting_period_minutes)
    elif request.voting_period_days:
        voting_ends = now + timedelta(days=request.voting_period_days)
    else:
        # Default to 3 days
        voting_ends = now + timedelta(days=3)

    # Derive proposal PDA for on_chain_address
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    proposal_pda, _ = solana_client.derive_proposal_pda(token_config_pda, next_num)

    # Create the proposal in the database
    proposer = request.proposer or "system"
    new_proposal = Proposal(
        token_id=token_id,
        on_chain_address=str(proposal_pda),
        proposal_number=next_num,
        proposer=proposer,
        action_type=request.action_type,
        action_data=request.action_data or {},
        description=request.description,
        votes_for=0,
        votes_against=0,
        votes_abstain=0,
        status="active",
        voting_starts=now,
        voting_ends=voting_ends,
        execution_delay_seconds=0,
        snapshot_slot=0,  # Would be current slot in production
    )
    db.add(new_proposal)
    await db.commit()
    await db.refresh(new_proposal)

    return {
        "success": True,
        "message": "Proposal created successfully",
        "proposal_id": new_proposal.id,
        "proposal_number": next_num,
        "voting_ends": voting_ends.isoformat(),
        "proposal_pda": str(proposal_pda),
    }


@router.post("/proposals/{proposal_id}/vote")
async def vote_on_proposal(
    request: VoteRequest,
    token_id: int = Path(...),
    proposal_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Vote on a proposal and update vote counts"""
    # Verify voter address is provided
    voter = request.voter
    if not voter:
        raise HTTPException(status_code=400, detail="Voter wallet address is required")

    # Verify proposal exists and is active
    result = await db.execute(
        select(Proposal).where(
            Proposal.token_id == token_id,
            Proposal.id == proposal_id
        )
    )
    proposal = result.scalar_one_or_none()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    now = datetime.utcnow()
    if now < proposal.voting_starts:
        raise HTTPException(status_code=400, detail="Voting has not started yet")
    if now > proposal.voting_ends:
        raise HTTPException(status_code=400, detail="Voting has ended")
    if proposal.status not in ["pending", "active"]:
        raise HTTPException(status_code=400, detail=f"Proposal is {proposal.status}, cannot vote")

    # Check for duplicate vote
    existing_vote = await db.execute(
        select(VoteRecord).where(
            VoteRecord.proposal_id == proposal_id,
            VoteRecord.voter == voter
        )
    )
    if existing_vote.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already voted on this proposal")

    # Get voter's token balance for vote weight
    balance_result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == voter
        )
    )
    balance_record = balance_result.scalar_one_or_none()
    vote_weight = balance_record.balance if balance_record else 1  # Default to 1 if no balance found

    # Record the vote
    vote_record = VoteRecord(
        token_id=token_id,
        proposal_id=proposal_id,
        voter=voter,
        vote=request.vote.value,
        weight=vote_weight,
        signature=str(uuid.uuid4()),  # Placeholder - would be actual tx signature in production
    )
    db.add(vote_record)

    # Update vote counts
    if request.vote.value == "for":
        proposal.votes_for += vote_weight
    elif request.vote.value == "against":
        proposal.votes_against += vote_weight
    else:  # abstain
        proposal.votes_abstain += vote_weight

    await db.commit()
    await db.refresh(proposal)

    return {
        "success": True,
        "message": f"Vote recorded: {request.vote.value}",
        "vote_weight": vote_weight,
        "votes_for": proposal.votes_for,
        "votes_against": proposal.votes_against,
        "votes_abstain": proposal.votes_abstain,
    }


@router.post("/proposals/{proposal_id}/execute")
async def execute_proposal(
    token_id: int = Path(...),
    proposal_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Execute a passed proposal - returns unsigned transaction for client signing"""
    result = await db.execute(
        select(Proposal).where(
            Proposal.token_id == token_id,
            Proposal.id == proposal_id
        )
    )
    proposal = result.scalar_one_or_none()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status != "passed":
        raise HTTPException(status_code=400, detail=f"Proposal is {proposal.status}, cannot execute")

    if proposal.executed_at:
        raise HTTPException(status_code=400, detail="Proposal already executed")

    now = datetime.utcnow()
    if now < proposal.voting_ends:
        raise HTTPException(status_code=400, detail="Voting has not ended yet")

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.token_id == token_id)
    )
    token = result.scalar_one_or_none()

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    proposal_pda, _ = solana_client.derive_proposal_pda(token_config_pda, proposal.proposal_number)

    return {
        "message": "Execute transaction prepared for signing",
        "proposal_pda": str(proposal_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.governance),
            "action": "execute_proposal",
            "data": {
                "action_type": proposal.action_type,
                "action_data": proposal.action_data,
            }
        }
    }


@router.get("/voting-power/{address}", response_model=VotingPowerResponse)
async def get_voting_power(
    token_id: int = Path(...),
    address: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Get voting power for an address based on token balance"""
    # Get current balance from database
    result = await db.execute(
        select(CurrentBalance).where(
            CurrentBalance.token_id == token_id,
            CurrentBalance.wallet == address
        )
    )
    balance_record = result.scalar_one_or_none()

    balance = balance_record.balance if balance_record else 0

    # In this implementation, voting power equals token balance (1:1)
    # Could be extended to support delegation or other voting power calculations
    return VotingPowerResponse(
        address=address,
        balance=balance,
        voting_power=balance,
        delegated_to=None,  # Delegation not implemented in this phase
    )
