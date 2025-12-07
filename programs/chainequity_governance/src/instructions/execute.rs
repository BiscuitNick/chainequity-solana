use anchor_lang::prelude::*;
use crate::state::{GovernanceConfig, Proposal, GovernanceAction, ProposalStatus, GOVERNANCE_CONFIG_SEED, PROPOSAL_SEED};
use crate::errors::GovernanceError;
use crate::events::{ProposalExecuted, ProposalStatusChanged};

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

    #[account(mut)]
    pub executor: Signer<'info>,
}

pub fn handler(ctx: Context<ExecuteProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.governance_config;
    let proposal = &mut ctx.accounts.proposal;

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

    // Log the action being executed for off-chain processing
    // The actual execution of complex actions (like CPI calls) would be done
    // in separate transactions triggered by the backend after this approval
    match &proposal.action {
        GovernanceAction::AddToAllowlist { wallet } => {
            msg!("Approved: Add {:?} to allowlist", wallet);
        }
        GovernanceAction::RemoveFromAllowlist { wallet } => {
            msg!("Approved: Remove {:?} from allowlist", wallet);
        }
        GovernanceAction::UpdateDailyTransferLimit { wallet, limit } => {
            msg!("Approved: Update daily limit for {:?} to {}", wallet, limit);
        }
        GovernanceAction::UpdateGlobalTransferLimit { limit } => {
            msg!("Approved: Update global transfer limit to {}", limit);
        }
        GovernanceAction::AddMultisigSigner { signer } => {
            msg!("Approved: Add multisig signer {:?}", signer);
        }
        GovernanceAction::RemoveMultisigSigner { signer } => {
            msg!("Approved: Remove multisig signer {:?}", signer);
        }
        GovernanceAction::UpdateThreshold { new_threshold } => {
            msg!("Approved: Update multisig threshold to {}", new_threshold);
        }
        GovernanceAction::InitiateStockSplit { multiplier } => {
            msg!("Approved: Initiate stock split with multiplier {}", multiplier);
        }
        GovernanceAction::UpdateSymbol { new_symbol } => {
            msg!("Approved: Update symbol to {}", new_symbol);
        }
        GovernanceAction::InitiateDividend { token, amount } => {
            msg!("Approved: Initiate dividend of {} with token {:?}", amount, token);
        }
        GovernanceAction::PauseTransfers => {
            msg!("Approved: Pause transfers");
        }
        GovernanceAction::UnpauseTransfers => {
            msg!("Approved: Unpause transfers");
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
