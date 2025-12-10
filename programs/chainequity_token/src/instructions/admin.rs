use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::errors::TokenError;
use crate::events::TokenPausedChanged;
use crate::state::{MintAuthority, MINT_AUTHORITY_SEED};

#[derive(Accounts)]
pub struct SetTokenPaused<'info> {
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,

    pub authority: Signer<'info>,
}

pub fn set_paused_handler(ctx: Context<SetTokenPaused>, paused: bool) -> Result<()> {
    let token_config = &mut ctx.accounts.token_config;
    token_config.is_paused = paused;

    let clock = Clock::get()?;

    emit!(TokenPausedChanged {
        token_config: token_config.key(),
        paused,
        changed_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Token paused state changed to: {}", paused);

    Ok(())
}

// ============================================================================
// INITIALIZE MINT AUTHORITY
// ============================================================================

/// Initialize mint authority for a token - transfers mint authority from token_config to a PDA
/// owned by the token program. This allows the token program to sign mint operations.
#[derive(Accounts)]
pub struct InitializeMintAuthority<'info> {
    /// The token config (current mint authority owner)
    #[account(
        constraint = token_config.mint == mint.key() @ TokenError::Unauthorized,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The mint account
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The new mint authority PDA
    #[account(
        init,
        payer = payer,
        space = MintAuthority::LEN,
        seeds = [MINT_AUTHORITY_SEED, token_config.key().as_ref()],
        bump,
    )]
    pub mint_authority: Account<'info, MintAuthority>,

    /// The current authority who can transfer mint authority (must be in multisig signers)
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_mint_authority_handler(ctx: Context<InitializeMintAuthority>) -> Result<()> {
    let token_config = &ctx.accounts.token_config;

    // Initialize the mint authority account - just store the data
    // The actual transfer of mint authority is done by the factory program via transfer_mint_authority
    let mint_authority = &mut ctx.accounts.mint_authority;
    mint_authority.token_config = token_config.key();
    mint_authority.mint = ctx.accounts.mint.key();
    mint_authority.bump = ctx.bumps.mint_authority;

    msg!(
        "Mint authority PDA initialized: {} for token: {}",
        mint_authority.key(),
        token_config.symbol
    );
    msg!(
        "IMPORTANT: Call factory.transfer_mint_authority to complete the setup"
    );

    Ok(())
}
