use anchor_lang::prelude::*;
use crate::state::{GovernanceConfig, Proposal, ProposalStatus, GOVERNANCE_CONFIG_SEED, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::ProposalStatusChanged;

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(
        seeds = [GOVERNANCE_CONFIG_SEED, governance_config.token_config.as_ref()],
        bump = governance_config.bump,
    )]
    pub governance_config: Account<'info, GovernanceConfig>,

    #[account(
        mut,
        seeds = [PROPOSAL_SEED, governance_config.key().as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,
}

pub fn finalize_handler(ctx: Context<FinalizeProposal>, total_supply: u64) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.governance_config;
    let proposal = &mut ctx.accounts.proposal;

    // Check voting has ended
    require!(clock.unix_timestamp > proposal.voting_ends, GovernanceError::VotingNotStarted);

    // Can only finalize active or pending proposals
    require!(
        proposal.status == ProposalStatus::Active || proposal.status == ProposalStatus::Pending,
        GovernanceError::ProposalNotActive
    );

    let old_status = proposal.status.clone();

    // Calculate if quorum was reached
    let total_votes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
    let quorum_threshold = (total_supply as u128 * config.quorum_percentage as u128 / 100) as u64;
    let quorum_reached = total_votes >= quorum_threshold;

    // Calculate if approval threshold was reached
    let decisive_votes = proposal.votes_for + proposal.votes_against;
    let approval_reached = if decisive_votes > 0 {
        let approval_pct = (proposal.votes_for as u128 * 100) / decisive_votes as u128;
        approval_pct >= config.approval_threshold as u128
    } else {
        false
    };

    // Determine final status
    if quorum_reached && approval_reached {
        proposal.status = ProposalStatus::Passed;
    } else {
        proposal.status = ProposalStatus::Failed;
    }

    emit!(ProposalStatusChanged {
        proposal: proposal.key(),
        old_status,
        new_status: proposal.status.clone(),
        slot: clock.slot,
    });

    msg!(
        "Finalized proposal {}: quorum_reached={}, approval_reached={}, status={:?}",
        proposal.id,
        quorum_reached,
        approval_reached,
        proposal.status
    );

    Ok(())
}
