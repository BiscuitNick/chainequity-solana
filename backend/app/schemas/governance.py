"""Governance schemas"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum


class VoteChoice(str, Enum):
    FOR = "for"
    AGAINST = "against"
    ABSTAIN = "abstain"


class ProposalStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    PASSED = "passed"
    FAILED = "failed"
    EXECUTED = "executed"
    CANCELLED = "cancelled"


class ProposalResponse(BaseModel):
    id: int
    proposal_number: int
    proposer: str
    action_type: str
    action_data: Dict[str, Any]
    description: Optional[str] = None
    votes_for: int
    votes_against: int
    votes_abstain: int
    status: str
    voting_starts: datetime
    voting_ends: datetime
    executed_at: Optional[datetime] = None
    quorum_reached: bool = False
    approval_reached: bool = False
    can_execute: bool = False


class CreateProposalRequest(BaseModel):
    action_type: str
    action_data: Dict[str, Any]
    description: str


class VoteRequest(BaseModel):
    vote: VoteChoice


class VotingPowerResponse(BaseModel):
    address: str
    balance: int
    voting_power: int
    delegated_to: Optional[str] = None
