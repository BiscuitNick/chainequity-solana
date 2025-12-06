use anchor_lang::prelude::*;
use crate::state::{GovernanceConfig, Proposal, GovernanceAction, ProposalStatus, GOVERNANCE_CONFIG_SEED, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::ProposalCreated;

#[derive(Accounts)]
#[instruction(action: GovernanceAction, description: String)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [GOVERNANCE_CONFIG_SEED, governance_config.token_config.as_ref()],
        bump = governance_config.bump,
    )]
    pub governance_config: Account<'info, GovernanceConfig>,

    #[account(
        init,
        payer = proposer,
        space = Proposal::LEN,
        seeds = [
            PROPOSAL_SEED,
            governance_config.key().as_ref(),
            &governance_config.proposal_count.to_le_bytes()
        ],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateProposal>,
    action: GovernanceAction,
    description: String,
) -> Result<()> {
    require!(description.len() <= 500, GovernanceError::DescriptionTooLong);

    let clock = Clock::get()?;
    let config = &mut ctx.accounts.governance_config;
    let proposal = &mut ctx.accounts.proposal;

    let proposal_id = config.proposal_count;
    config.proposal_count = config.proposal_count.checked_add(1).unwrap();

    proposal.id = proposal_id;
    proposal.token_config = config.token_config;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.action = action.clone();
    proposal.description = description;
    proposal.votes_for = 0;
    proposal.votes_against = 0;
    proposal.votes_abstain = 0;
    proposal.status = ProposalStatus::Pending;
    proposal.voting_starts = clock.unix_timestamp + config.voting_delay as i64;
    proposal.voting_ends = proposal.voting_starts + config.voting_period as i64;
    proposal.execution_delay = config.execution_delay;
    proposal.executed_at = None;
    proposal.snapshot_slot = clock.slot;
    proposal.bump = ctx.bumps.proposal;

    emit!(ProposalCreated {
        token_config: config.token_config,
        proposal: proposal.key(),
        proposal_id,
        proposer: ctx.accounts.proposer.key(),
        action,
        voting_starts: proposal.voting_starts,
        voting_ends: proposal.voting_ends,
        snapshot_slot: clock.slot,
        slot: clock.slot,
    });

    msg!("Created proposal {} with voting starting at {}", proposal_id, proposal.voting_starts);

    Ok(())
}
