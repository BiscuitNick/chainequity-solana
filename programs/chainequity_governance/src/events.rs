use anchor_lang::prelude::*;
use crate::state::{GovernanceAction, Vote, ProposalStatus};

#[event]
pub struct GovernanceConfigInitialized {
    pub token_config: Pubkey,
    pub governance_config: Pubkey,
    pub min_proposal_threshold: u64,
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub slot: u64,
}

#[event]
pub struct ProposalCreated {
    pub token_config: Pubkey,
    pub proposal: Pubkey,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub action: GovernanceAction,
    pub voting_starts: i64,
    pub voting_ends: i64,
    pub snapshot_slot: u64,
    pub slot: u64,
}

#[event]
pub struct VoteCast {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote: Vote,
    pub weight: u64,
    pub slot: u64,
}

#[event]
pub struct ProposalStatusChanged {
    pub proposal: Pubkey,
    pub old_status: ProposalStatus,
    pub new_status: ProposalStatus,
    pub slot: u64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal: Pubkey,
    pub executed_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ProposalCancelled {
    pub proposal: Pubkey,
    pub cancelled_by: Pubkey,
    pub slot: u64,
}
