use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer};
use anchor_spl::token_interface::{Mint, TokenAccount};
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{AllowlistEntry, AllowlistStatus, WalletRestrictions, ALLOWLIST_SEED, RESTRICTIONS_SEED};
use crate::errors::TokenError;
use crate::events::{TokensTransferred, TransferBlocked};

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(
        constraint = !token_config.is_paused @ TokenError::TransfersPaused,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    // Sender allowlist check
    #[account(
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), sender.key().as_ref()],
        bump = sender_allowlist.bump,
        constraint = sender_allowlist.status == AllowlistStatus::Active @ TokenError::SenderNotApproved,
    )]
    pub sender_allowlist: Account<'info, AllowlistEntry>,

    // Recipient allowlist check
    #[account(
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), recipient.key().as_ref()],
        bump = recipient_allowlist.bump,
        constraint = recipient_allowlist.status == AllowlistStatus::Active @ TokenError::RecipientNotApproved,
    )]
    pub recipient_allowlist: Account<'info, AllowlistEntry>,

    // Optional sender restrictions
    #[account(
        mut,
        seeds = [RESTRICTIONS_SEED, token_config.key().as_ref(), sender.key().as_ref()],
        bump = sender_restrictions.bump,
    )]
    pub sender_restrictions: Option<Account<'info, WalletRestrictions>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Recipient wallet
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, TokenError::InvalidAmount);

    let clock = Clock::get()?;

    // Check restrictions if present
    if let Some(ref mut restrictions) = ctx.accounts.sender_restrictions {
        // Check lockout period
        if let Some(lockout_until) = restrictions.lockout_until {
            if clock.unix_timestamp < lockout_until {
                emit!(TransferBlocked {
                    token_config: ctx.accounts.token_config.key(),
                    from: ctx.accounts.sender.key(),
                    to: ctx.accounts.recipient.key(),
                    amount,
                    reason: "Wallet is in lockout period".to_string(),
                    slot: clock.slot,
                });
                return Err(TokenError::InLockoutPeriod.into());
            }
        }

        // Check daily limit
        if let Some(daily_limit) = restrictions.daily_transfer_limit {
            // Reset if new day
            let current_day = clock.unix_timestamp / 86400;
            let last_day = restrictions.last_transfer_day / 86400;

            if current_day > last_day {
                restrictions.transferred_today = 0;
                restrictions.last_transfer_day = clock.unix_timestamp;
            }

            let new_total = restrictions.transferred_today
                .checked_add(amount)
                .ok_or(TokenError::MathOverflow)?;

            if new_total > daily_limit {
                emit!(TransferBlocked {
                    token_config: ctx.accounts.token_config.key(),
                    from: ctx.accounts.sender.key(),
                    to: ctx.accounts.recipient.key(),
                    amount,
                    reason: "Transfer exceeds daily limit".to_string(),
                    slot: clock.slot,
                });
                return Err(TokenError::DailyLimitExceeded.into());
            }

            restrictions.transferred_today = new_total;
        }
    }

    // Check recipient max balance if restrictions exist
    // (Would need recipient_restrictions account for this)

    // Execute transfer
    token_2022::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(TokensTransferred {
        token_config: ctx.accounts.token_config.key(),
        from: ctx.accounts.sender.key(),
        to: ctx.accounts.recipient.key(),
        amount,
        slot: clock.slot,
    });

    msg!("Transferred {} tokens from {} to {}",
        amount,
        ctx.accounts.sender.key(),
        ctx.accounts.recipient.key()
    );

    Ok(())
}
