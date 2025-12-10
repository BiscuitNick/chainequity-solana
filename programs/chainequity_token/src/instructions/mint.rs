use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, MintTo};
use anchor_spl::token_interface::{Mint, TokenAccount};
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{AllowlistEntry, AllowlistStatus, MintAuthority, ALLOWLIST_SEED, MINT_AUTHORITY_SEED};
use crate::errors::TokenError;
use crate::events::TokensMinted;

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The mint authority PDA that can sign for minting
    #[account(
        seeds = [MINT_AUTHORITY_SEED, token_config.key().as_ref()],
        bump = mint_authority.bump,
        constraint = mint_authority.token_config == token_config.key() @ TokenError::Unauthorized,
        constraint = mint_authority.mint == mint.key() @ TokenError::Unauthorized,
    )]
    pub mint_authority: Account<'info, MintAuthority>,

    #[account(
        seeds = [ALLOWLIST_SEED, token_config.key().as_ref(), recipient.key().as_ref()],
        bump = recipient_allowlist.bump,
        constraint = recipient_allowlist.status == AllowlistStatus::Active @ TokenError::RecipientNotApproved,
    )]
    pub recipient_allowlist: Account<'info, AllowlistEntry>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = recipient,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Recipient wallet
    pub recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, TokenError::InvalidAmount);
    require!(!ctx.accounts.token_config.is_paused, TokenError::TransfersPaused);

    let token_config = &ctx.accounts.token_config;
    let mint_authority = &ctx.accounts.mint_authority;
    let token_config_key = token_config.key();

    // Use mint_authority PDA for signing - this PDA is owned by the token program
    let seeds = &[
        MINT_AUTHORITY_SEED,
        token_config_key.as_ref(),
        &[mint_authority.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Mint tokens using the mint_authority PDA as signer
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update total supply
    let token_config = &mut ctx.accounts.token_config;
    token_config.total_supply = token_config.total_supply
        .checked_add(amount)
        .ok_or(TokenError::MathOverflow)?;

    let clock = Clock::get()?;

    emit!(TokensMinted {
        token_config: token_config.key(),
        to: ctx.accounts.recipient.key(),
        amount,
        new_total_supply: token_config.total_supply,
        minted_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Minted {} tokens to {}", amount, ctx.accounts.recipient.key());

    Ok(())
}
