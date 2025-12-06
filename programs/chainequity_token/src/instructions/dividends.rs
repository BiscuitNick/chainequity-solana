use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer};
use anchor_spl::token_interface::{Mint, TokenAccount};
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{DividendRound, DividendClaim, DividendStatus, DIVIDEND_ROUND_SEED, DIVIDEND_CLAIM_SEED};
use crate::errors::TokenError;
use crate::events::{DividendRoundCreated, DividendClaimed};

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CreateDividendRound<'info> {
    #[account(
        constraint = token_config.features.dividends_enabled @ TokenError::FeatureDisabled,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        init,
        payer = authority,
        space = DividendRound::LEN,
        seeds = [
            DIVIDEND_ROUND_SEED,
            token_config.key().as_ref(),
            &round_id.to_le_bytes()
        ],
        bump
    )]
    pub dividend_round: Account<'info, DividendRound>,

    /// Payment token mint (e.g., TestUSDC)
    pub payment_token: InterfaceAccount<'info, Mint>,

    /// Pool token account holding dividend funds
    #[account(
        mut,
        token::mint = payment_token,
    )]
    pub dividend_pool: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_round_handler(
    ctx: Context<CreateDividendRound>,
    round_id: u64,
    total_pool: u64,
    expires_in_seconds: Option<u64>,
) -> Result<()> {
    require!(total_pool > 0, TokenError::InvalidAmount);

    let clock = Clock::get()?;
    let token_config = &ctx.accounts.token_config;
    let round = &mut ctx.accounts.dividend_round;

    // Calculate amount per share
    let amount_per_share = if token_config.total_supply > 0 {
        (total_pool as u128 * 1_000_000 / token_config.total_supply as u128) as u64
    } else {
        0
    };

    round.token_config = token_config.key();
    round.id = round_id;
    round.payment_token = ctx.accounts.payment_token.key();
    round.total_pool = total_pool;
    round.snapshot_slot = clock.slot;
    round.amount_per_share = amount_per_share;
    round.status = DividendStatus::Active;
    round.created_at = clock.unix_timestamp;
    round.expires_at = expires_in_seconds.map(|s| clock.unix_timestamp + s as i64);
    round.bump = ctx.bumps.dividend_round;

    emit!(DividendRoundCreated {
        token_config: token_config.key(),
        round: round.key(),
        round_id: round.id,
        payment_token: ctx.accounts.payment_token.key(),
        total_pool,
        amount_per_share,
        snapshot_slot: clock.slot,
        expires_at: round.expires_at,
        created_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Created dividend round with {} total pool", total_pool);

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimDividend<'info> {
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        seeds = [
            DIVIDEND_ROUND_SEED,
            token_config.key().as_ref(),
            &dividend_round.id.to_le_bytes()
        ],
        bump = dividend_round.bump,
        constraint = dividend_round.status == DividendStatus::Active @ TokenError::DividendNotActive,
    )]
    pub dividend_round: Account<'info, DividendRound>,

    #[account(
        init,
        payer = claimant,
        space = DividendClaim::LEN,
        seeds = [
            DIVIDEND_CLAIM_SEED,
            dividend_round.key().as_ref(),
            claimant.key().as_ref()
        ],
        bump
    )]
    pub dividend_claim: Account<'info, DividendClaim>,

    /// Claimant's equity token account (to verify holdings at snapshot)
    #[account(
        token::mint = token_config.mint,
        token::authority = claimant,
    )]
    pub claimant_equity_account: InterfaceAccount<'info, TokenAccount>,

    /// Dividend pool token account
    #[account(
        mut,
        token::mint = dividend_round.payment_token,
    )]
    pub dividend_pool: InterfaceAccount<'info, TokenAccount>,

    /// Claimant's payment token account
    #[account(
        mut,
        token::mint = dividend_round.payment_token,
        token::authority = claimant,
    )]
    pub claimant_payment_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub claimant: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn claim_handler(ctx: Context<ClaimDividend>) -> Result<()> {
    let clock = Clock::get()?;
    let round = &ctx.accounts.dividend_round;

    // Check expiration
    if let Some(expires_at) = round.expires_at {
        require!(clock.unix_timestamp <= expires_at, TokenError::DividendExpired);
    }

    // Get claimant's balance (in production, would use snapshot)
    let balance = ctx.accounts.claimant_equity_account.amount;
    require!(balance > 0, TokenError::NoEntitlement);

    // Calculate entitlement
    let entitlement = (balance as u128 * round.amount_per_share as u128 / 1_000_000) as u64;
    require!(entitlement > 0, TokenError::NoEntitlement);

    // Record claim
    let claim = &mut ctx.accounts.dividend_claim;
    claim.round = round.key();
    claim.wallet = ctx.accounts.claimant.key();
    claim.amount = entitlement;
    claim.claimed_at = clock.unix_timestamp;
    claim.bump = ctx.bumps.dividend_claim;

    // Transfer would happen here using PDA signing for dividend pool

    emit!(DividendClaimed {
        token_config: ctx.accounts.token_config.key(),
        round: round.key(),
        wallet: ctx.accounts.claimant.key(),
        amount: entitlement,
        slot: clock.slot,
    });

    msg!("Claimed {} dividend tokens", entitlement);

    Ok(())
}
