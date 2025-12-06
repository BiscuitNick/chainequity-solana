use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;
use state::{GovernanceAction, Vote as VoteChoice};

declare_id!("BPFLoaderUpgradeab1e11111111111111111111111");

#[program]
pub mod chainequity_governance {
    use super::*;

    /// Create a governance proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        action: GovernanceAction,
        description: String,
    ) -> Result<()> {
        instructions::create_proposal::handler(ctx, action, description)
    }

    /// Cast a vote on a proposal
    pub fn cast_vote(
        ctx: Context<CastVote>,
        vote_choice: VoteChoice,
    ) -> Result<()> {
        instructions::vote::handler(ctx, vote_choice)
    }

    /// Execute a passed proposal
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::execute::handler(ctx)
    }

    /// Cancel a proposal (proposer only)
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        instructions::cancel::handler(ctx)
    }
}
