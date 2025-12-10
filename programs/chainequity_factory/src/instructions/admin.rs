use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, SetAuthority};
use anchor_spl::token_interface::Mint;
use anchor_spl::token_interface::spl_token_2022::instruction::AuthorityType;
use crate::state::{TokenFactory, FACTORY_SEED};
use crate::instructions::create_token::{TokenConfig, TOKEN_CONFIG_SEED};
use crate::errors::FactoryError;
use crate::events::FactoryPausedChanged;

#[derive(Accounts)]
pub struct SetFactoryPaused<'info> {
    #[account(
        mut,
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority @ FactoryError::Unauthorized,
    )]
    pub factory: Account<'info, TokenFactory>,

    pub authority: Signer<'info>,
}

pub fn set_paused_handler(ctx: Context<SetFactoryPaused>, paused: bool) -> Result<()> {
    let factory = &mut ctx.accounts.factory;
    factory.paused = paused;

    emit!(FactoryPausedChanged {
        paused,
        changed_by: ctx.accounts.authority.key(),
    });

    msg!("Factory paused state changed to: {}", paused);

    Ok(())
}

// ============================================================================
// TRANSFER MINT AUTHORITY
// ============================================================================

/// Transfer mint authority from token_config PDA to a new authority.
/// This allows the token program to have its own PDA that can sign for minting.
#[derive(Accounts)]
pub struct TransferMintAuthority<'info> {
    /// The token config (current mint authority owner)
    #[account(
        seeds = [TOKEN_CONFIG_SEED, token_config.factory.as_ref(), &token_config.token_id.to_le_bytes()],
        bump = token_config.bump,
        constraint = token_config.mint == mint.key() @ FactoryError::Unauthorized,
    )]
    pub token_config: Account<'info, TokenConfig>,

    /// The mint account
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: The new authority to set (validated by caller)
    pub new_authority: UncheckedAccount<'info>,

    /// Authority must be a signer from the multisig
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn transfer_mint_authority_handler(ctx: Context<TransferMintAuthority>) -> Result<()> {
    let token_config = &ctx.accounts.token_config;

    // Build signer seeds for the token_config PDA
    let factory = token_config.factory;
    let token_id = token_config.token_id;
    let seeds = &[
        TOKEN_CONFIG_SEED,
        factory.as_ref(),
        &token_id.to_le_bytes(),
        &[token_config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer mint authority from token_config to the new authority
    token_2022::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.token_config.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        Some(ctx.accounts.new_authority.key()),
    )?;

    msg!(
        "Mint authority transferred to: {} for token: {}",
        ctx.accounts.new_authority.key(),
        token_config.symbol
    );

    Ok(())
}
