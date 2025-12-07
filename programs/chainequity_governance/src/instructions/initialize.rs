use anchor_lang::prelude::*;
use crate::state::{GovernanceConfig, GOVERNANCE_CONFIG_SEED};
use crate::events::GovernanceConfigInitialized;

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    /// The token config this governance is for
    /// CHECK: We just need the pubkey to associate governance
    pub token_config: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = GovernanceConfig::LEN,
        seeds = [GOVERNANCE_CONFIG_SEED, token_config.key().as_ref()],
        bump
    )]
    pub governance_config: Account<'info, GovernanceConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeGovernanceParams {
    /// Minimum tokens to create proposal (e.g., 100 tokens = 1% of 10000 supply)
    pub min_proposal_threshold: u64,
    /// Seconds after creation before voting starts (e.g., 86400 = 1 day)
    pub voting_delay: u64,
    /// Seconds voting is open (e.g., 259200 = 3 days)
    pub voting_period: u64,
    /// Percentage of supply that must vote (e.g., 10 = 10%)
    pub quorum_percentage: u8,
    /// Percentage of votes needed to pass (e.g., 50 = 50%)
    pub approval_threshold: u8,
    /// Seconds after passing before execution allowed (e.g., 86400 = 1 day)
    pub execution_delay: u64,
    /// Seconds window to execute after delay (e.g., 604800 = 7 days)
    pub execution_window: u64,
}

pub fn initialize_handler(ctx: Context<InitializeGovernance>, params: InitializeGovernanceParams) -> Result<()> {
    let config = &mut ctx.accounts.governance_config;
    let clock = Clock::get()?;

    config.token_config = ctx.accounts.token_config.key();
    config.min_proposal_threshold = params.min_proposal_threshold;
    config.voting_delay = params.voting_delay;
    config.voting_period = params.voting_period;
    config.quorum_percentage = params.quorum_percentage;
    config.approval_threshold = params.approval_threshold;
    config.execution_delay = params.execution_delay;
    config.execution_window = params.execution_window;
    config.proposal_count = 0;
    config.bump = ctx.bumps.governance_config;

    emit!(GovernanceConfigInitialized {
        token_config: ctx.accounts.token_config.key(),
        governance_config: config.key(),
        min_proposal_threshold: params.min_proposal_threshold,
        voting_delay: params.voting_delay,
        voting_period: params.voting_period,
        quorum_percentage: params.quorum_percentage,
        approval_threshold: params.approval_threshold,
        slot: clock.slot,
    });

    msg!("Initialized governance config for token {:?}", ctx.accounts.token_config.key());

    Ok(())
}
