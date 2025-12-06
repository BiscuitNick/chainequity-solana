use anchor_lang::prelude::*;
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{WalletRestrictions, RESTRICTIONS_SEED};
use crate::errors::TokenError;
use crate::events::WalletRestrictionsUpdated;

#[derive(Accounts)]
pub struct SetWalletRestrictions<'info> {
    #[account(
        constraint = token_config.features.transfer_restrictions_enabled @ TokenError::FeatureDisabled,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = WalletRestrictions::LEN,
        seeds = [RESTRICTIONS_SEED, token_config.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub wallet_restrictions: Account<'info, WalletRestrictions>,

    /// CHECK: Wallet to set restrictions for
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_handler(
    ctx: Context<SetWalletRestrictions>,
    daily_limit: Option<u64>,
    lockout_until: Option<i64>,
    max_balance: Option<u64>,
) -> Result<()> {
    let restrictions = &mut ctx.accounts.wallet_restrictions;
    let clock = Clock::get()?;

    restrictions.token_config = ctx.accounts.token_config.key();
    restrictions.wallet = ctx.accounts.wallet.key();
    restrictions.daily_transfer_limit = daily_limit;
    restrictions.lockout_until = lockout_until;
    restrictions.max_balance = max_balance;

    // Initialize tracking if new
    if restrictions.bump == 0 {
        restrictions.transferred_today = 0;
        restrictions.last_transfer_day = clock.unix_timestamp;
        restrictions.bump = ctx.bumps.wallet_restrictions;
    }

    emit!(WalletRestrictionsUpdated {
        token_config: ctx.accounts.token_config.key(),
        wallet: ctx.accounts.wallet.key(),
        daily_limit,
        lockout_until,
        max_balance,
        updated_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Updated restrictions for wallet: {}", ctx.accounts.wallet.key());

    Ok(())
}
