"""Governance API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.models.database import get_db
from app.schemas.governance import (
    ProposalResponse,
    CreateProposalRequest,
    VoteRequest,
    VotingPowerResponse,
)

router = APIRouter()


@router.get("/proposals", response_model=List[ProposalResponse])
async def list_proposals(token_id: int, db: AsyncSession = Depends(get_db)):
    """List all governance proposals"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(token_id: int, proposal_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific proposal"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/proposals")
async def create_proposal(
    token_id: int,
    request: CreateProposalRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new proposal"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/proposals/{proposal_id}/vote")
async def vote_on_proposal(
    token_id: int,
    proposal_id: int,
    request: VoteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Vote on a proposal"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.post("/proposals/{proposal_id}/execute")
async def execute_proposal(
    token_id: int,
    proposal_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Execute a passed proposal"""
    # TODO: Implement via Solana
    raise HTTPException(status_code=501, detail="Requires Solana interaction")


@router.get("/voting-power/{address}", response_model=VotingPowerResponse)
async def get_voting_power(
    token_id: int,
    address: str,
    db: AsyncSession = Depends(get_db)
):
    """Get voting power for an address"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")
