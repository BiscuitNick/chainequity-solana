use anchor_lang::prelude::*;
use crate::state::{Proposal, ProposalStatus, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::{ProposalExecuted, ProposalStatusChanged};

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal.token_config.as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(mut)]
    pub executor: Signer<'info>,
}

pub fn handler(ctx: Context<ExecuteProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    // Check proposal has passed
    require!(proposal.status == ProposalStatus::Passed, GovernanceError::ProposalNotPassed);

    // Check execution delay has elapsed
    let execution_allowed_at = proposal.voting_ends + proposal.execution_delay as i64;
    require!(clock.unix_timestamp >= execution_allowed_at, GovernanceError::ExecutionDelayNotElapsed);

    // Execute the action (in production, would CPI to appropriate program)
    // For now, just mark as executed

    let old_status = proposal.status.clone();
    proposal.status = ProposalStatus::Executed;
    proposal.executed_at = Some(clock.unix_timestamp);

    emit!(ProposalStatusChanged {
        proposal: proposal.key(),
        old_status,
        new_status: ProposalStatus::Executed,
        slot: clock.slot,
    });

    emit!(ProposalExecuted {
        proposal: proposal.key(),
        executed_by: ctx.accounts.executor.key(),
        slot: clock.slot,
    });

    msg!("Executed proposal {}", proposal.id);

    Ok(())
}
