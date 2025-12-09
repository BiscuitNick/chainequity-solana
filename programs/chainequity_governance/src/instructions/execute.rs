use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::state::{GovernanceConfig, Proposal, GovernanceAction, ProposalStatus, GOVERNANCE_CONFIG_SEED, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::{ProposalExecuted, ProposalStatusChanged, StockSplitInitiated, SymbolChangeInitiated, DividendInitiated};

use chainequity_factory::instructions::create_token::TokenConfig;

/// Execute a passed proposal
/// For stock splits and symbol changes, this marks the proposal as executed
/// and emits events that the backend will process to complete the action.
/// For dividends, this creates the dividend round on-chain.
#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
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

    /// Token config for the token being governed
    #[account(
        mut,
        constraint = token_config.key() == governance_config.token_config @ GovernanceError::InvalidTokenConfig,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The token mint
    #[account(
        constraint = mint.key() == token_config.mint @ GovernanceError::InvalidTokenConfig,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub executor: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ExecuteProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.governance_config;
    let proposal = &mut ctx.accounts.proposal;
    let token_config = &mut ctx.accounts.token_config;

    // Check proposal has passed
    require!(proposal.status == ProposalStatus::Passed, GovernanceError::ProposalNotPassed);

    // Check not already executed
    require!(proposal.executed_at.is_none(), GovernanceError::AlreadyExecuted);

    // Check execution delay has elapsed
    let execution_allowed_at = proposal.voting_ends + proposal.execution_delay as i64;
    require!(clock.unix_timestamp >= execution_allowed_at, GovernanceError::ExecutionDelayNotElapsed);

    // Check within execution window
    let execution_window_ends = execution_allowed_at + config.execution_window as i64;
    require!(clock.unix_timestamp <= execution_window_ends, GovernanceError::ExecutionWindowPassed);

    // Execute the action based on type
    match &proposal.action {
        GovernanceAction::InitiateStockSplit { multiplier } => {
            // Emit event for backend to process the split
            // The actual balance updates happen through the chainequity_token program
            // which requires iterating through all token accounts
            emit!(StockSplitInitiated {
                token_config: token_config.key(),
                proposal: proposal.key(),
                multiplier: *multiplier,
                initiated_by: ctx.accounts.executor.key(),
                slot: clock.slot,
            });
            msg!("Stock split initiated: {}x multiplier", multiplier);
        }
        GovernanceAction::UpdateSymbol { new_symbol } => {
            // Update the symbol directly in token_config
            let old_symbol = token_config.symbol.clone();
            token_config.symbol = new_symbol.clone();

            emit!(SymbolChangeInitiated {
                token_config: token_config.key(),
                proposal: proposal.key(),
                old_symbol,
                new_symbol: new_symbol.clone(),
                changed_by: ctx.accounts.executor.key(),
                slot: clock.slot,
            });
            msg!("Symbol changed to: {}", new_symbol);
        }
        GovernanceAction::InitiateDividend { payment_token, total_amount } => {
            // Emit event for backend to create the dividend round
            // The dividend round creation requires additional accounts
            // (payment token vault, etc.) that would need a separate instruction
            emit!(DividendInitiated {
                token_config: token_config.key(),
                proposal: proposal.key(),
                payment_token: *payment_token,
                total_amount: *total_amount,
                initiated_by: ctx.accounts.executor.key(),
                slot: clock.slot,
            });
            msg!("Dividend initiated: {} tokens from {:?}", total_amount, payment_token);
        }
    }

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
