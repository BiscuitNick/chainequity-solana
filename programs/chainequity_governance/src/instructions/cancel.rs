use anchor_lang::prelude::*;
use crate::state::{Proposal, ProposalStatus, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::{ProposalCancelled, ProposalStatusChanged};

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal.token_config.as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
        constraint = proposal.proposer == proposer.key() @ GovernanceError::NotProposer,
    )]
    pub proposal: Account<'info, Proposal>,

    pub proposer: Signer<'info>,
}

pub fn handler(ctx: Context<CancelProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    // Can only cancel before voting starts
    require!(
        clock.unix_timestamp < proposal.voting_starts,
        GovernanceError::VotingAlreadyStarted
    );

    let old_status = proposal.status.clone();
    proposal.status = ProposalStatus::Cancelled;

    emit!(ProposalStatusChanged {
        proposal: proposal.key(),
        old_status,
        new_status: ProposalStatus::Cancelled,
        slot: clock.slot,
    });

    emit!(ProposalCancelled {
        proposal: proposal.key(),
        cancelled_by: ctx.accounts.proposer.key(),
        slot: clock.slot,
    });

    msg!("Cancelled proposal {}", proposal.id);

    Ok(())
}
