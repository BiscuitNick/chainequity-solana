use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;
use state::{GovernanceAction, Vote as VoteChoice};

declare_id!("qonFMa4fD9KLRWG73aQzvQ2d5WnBNF5S9jzaRwLcwQQ");

#[program]
pub mod chainequity_governance {
    use super::*;

    /// Initialize governance configuration for a token
    pub fn initialize_governance(
        ctx: Context<InitializeGovernance>,
        params: InitializeGovernanceParams,
    ) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, params)
    }

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

    /// Finalize a proposal after voting ends (determine passed/failed)
    pub fn finalize_proposal(
        ctx: Context<FinalizeProposal>,
        total_supply: u64,
    ) -> Result<()> {
        instructions::finalize::finalize_handler(ctx, total_supply)
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
