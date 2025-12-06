use anchor_lang::prelude::*;
use crate::state::{Proposal, VoteRecord, Vote, ProposalStatus, PROPOSAL_SEED, VOTE_RECORD_SEED};
use crate::errors::GovernanceError;
use crate::events::VoteCast;

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal.token_config.as_ref(), &proposal.id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        space = VoteRecord::LEN,
        seeds = [VOTE_RECORD_SEED, proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, vote: Vote) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    // Check voting is open
    require!(clock.unix_timestamp >= proposal.voting_starts, GovernanceError::VotingNotStarted);
    require!(clock.unix_timestamp <= proposal.voting_ends, GovernanceError::VotingEnded);

    // Update status if needed
    if proposal.status == ProposalStatus::Pending && clock.unix_timestamp >= proposal.voting_starts {
        proposal.status = ProposalStatus::Active;
    }

    require!(proposal.status == ProposalStatus::Active, GovernanceError::ProposalNotActive);

    // For demo, use fixed weight. In production, query token balance at snapshot
    let weight: u64 = 1000;

    // Record vote
    match vote {
        Vote::For => proposal.votes_for = proposal.votes_for.checked_add(weight).unwrap(),
        Vote::Against => proposal.votes_against = proposal.votes_against.checked_add(weight).unwrap(),
        Vote::Abstain => proposal.votes_abstain = proposal.votes_abstain.checked_add(weight).unwrap(),
    }

    let vote_record = &mut ctx.accounts.vote_record;
    vote_record.proposal = proposal.key();
    vote_record.voter = ctx.accounts.voter.key();
    vote_record.vote = vote.clone();
    vote_record.weight = weight;
    vote_record.voted_at = clock.unix_timestamp;
    vote_record.bump = ctx.bumps.vote_record;

    emit!(VoteCast {
        proposal: proposal.key(),
        voter: ctx.accounts.voter.key(),
        vote,
        weight,
        slot: clock.slot,
    });

    msg!("Vote cast on proposal {} with weight {}", proposal.id, weight);

    Ok(())
}
