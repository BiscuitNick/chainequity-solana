"""Governance API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime

from app.models.database import get_db
from app.models.governance import Proposal, VoteRecord
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
    """Create a new proposal - returns unsigned transaction for client signing"""
    # Verify token exists
    result = await db.execute(
        select(Token).where(Token.id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Check governance is enabled
    if not token.features.get("governance_enabled", False):
        raise HTTPException(status_code=400, detail="Governance not enabled for this token")

    # Get next proposal number
    result = await db.execute(
        select(func.max(Proposal.proposal_number)).where(Proposal.token_id == token_id)
    )
    max_num = result.scalar() or 0
    next_num = max_num + 1

    # Return transaction data for client to sign
    # In production, this would build the actual Solana transaction
    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    proposal_pda, _ = solana_client.derive_proposal_pda(token_config_pda, next_num)

    return {
        "message": "Transaction prepared for signing",
        "proposal_number": next_num,
        "proposal_pda": str(proposal_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.governance),
            "action": "create_proposal",
            "data": {
                "action_type": request.action_type,
                "action_data": request.action_data,
                "description": request.description,
            }
        }
    }


@router.post("/proposals/{proposal_id}/vote")
async def vote_on_proposal(
    request: VoteRequest,
    token_id: int = Path(...),
    proposal_id: int = Path(...),
    db: AsyncSession = Depends(get_db)
):
    """Vote on a proposal - returns unsigned transaction for client signing"""
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

    # Get token for mint address
    result = await db.execute(
        select(Token).where(Token.id == token_id)
    )
    token = result.scalar_one_or_none()

    solana_client = await get_solana_client()
    token_config_pda, _ = solana_client.derive_token_config_pda(Pubkey.from_string(token.mint_address))
    proposal_pda, _ = solana_client.derive_proposal_pda(token_config_pda, proposal.proposal_number)

    return {
        "message": "Vote transaction prepared for signing",
        "proposal_pda": str(proposal_pda),
        "instruction": {
            "program": str(solana_client.program_addresses.governance),
            "action": "vote",
            "data": {
                "vote": request.vote.value,
            }
        }
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
        select(Token).where(Token.id == token_id)
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
