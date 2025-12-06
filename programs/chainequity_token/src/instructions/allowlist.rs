use anchor_lang::prelude::*;
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{AllowlistEntry, AllowlistStatus, ALLOWLIST_SEED};
use crate::errors::TokenError;
use crate::events::{WalletApproved, WalletRevoked, AllowlistStatusChanged};

#[derive(Accounts)]
pub struct AddToAllowlist<'info> {
    #[account(
        constraint = !token_config.is_paused @ TokenError::TransfersPaused,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        init,
        payer = authority,
        space = AllowlistEntry::LEN,
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// CHECK: Wallet being added to allowlist
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_handler(ctx: Context<AddToAllowlist>, kyc_level: u8) -> Result<()> {
    let entry = &mut ctx.accounts.allowlist_entry;
    let clock = Clock::get()?;

    entry.token_config = ctx.accounts.token_config.key();
    entry.wallet = ctx.accounts.wallet.key();
    entry.approved_at = clock.unix_timestamp;
    entry.approved_by = ctx.accounts.authority.key();
    entry.status = AllowlistStatus::Active;
    entry.kyc_level = kyc_level;
    entry.bump = ctx.bumps.allowlist_entry;

    emit!(WalletApproved {
        token_config: ctx.accounts.token_config.key(),
        wallet: ctx.accounts.wallet.key(),
        kyc_level,
        approved_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Added wallet to allowlist: {}", ctx.accounts.wallet.key());

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveFromAllowlist<'info> {
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), wallet.key().as_ref()],
        bump = allowlist_entry.bump,
        close = authority
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    /// CHECK: Wallet being removed from allowlist
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn remove_handler(ctx: Context<RemoveFromAllowlist>) -> Result<()> {
    let clock = Clock::get()?;

    emit!(WalletRevoked {
        token_config: ctx.accounts.token_config.key(),
        wallet: ctx.accounts.wallet.key(),
        revoked_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Removed wallet from allowlist: {}", ctx.accounts.wallet.key());

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAllowlistStatus<'info> {
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), allowlist_entry.wallet.as_ref()],
        bump = allowlist_entry.bump,
    )]
    pub allowlist_entry: Account<'info, AllowlistEntry>,

    pub authority: Signer<'info>,
}

pub fn update_status_handler(
    ctx: Context<UpdateAllowlistStatus>,
    status: AllowlistStatus,
) -> Result<()> {
    let entry = &mut ctx.accounts.allowlist_entry;
    let old_status = entry.status.clone();
    entry.status = status.clone();

    let clock = Clock::get()?;

    emit!(AllowlistStatusChanged {
        token_config: ctx.accounts.token_config.key(),
        wallet: entry.wallet,
        old_status,
        new_status: status,
        changed_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    Ok(())
}
