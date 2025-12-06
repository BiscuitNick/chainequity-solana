use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::{TokenFactory, CreateTokenParams, TokenFeatures, FACTORY_SEED};
use crate::errors::FactoryError;
use crate::events::TokenCreated;

/// Token config account - stored for each created token
#[account]
pub struct TokenConfig {
    /// Parent factory
    pub factory: Pubkey,
    /// Sequential ID from factory
    pub token_id: u64,
    /// Multi-sig address for this token
    pub authority: Pubkey,
    /// SPL Token mint
    pub mint: Pubkey,
    /// Mutable ticker (max 10 chars)
    pub symbol: String,
    /// Token name (max 50 chars)
    pub name: String,
    /// Token decimals
    pub decimals: u8,
    /// Current total supply
    pub total_supply: u64,
    /// For virtual split (default 1)
    pub split_multiplier: u64,
    /// Enabled features
    pub features: TokenFeatures,
    /// Emergency pause
    pub is_paused: bool,
    /// Seconds before upgrade executes
    pub upgrade_timelock: i64,
    /// Creation timestamp
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl TokenConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // factory
        8 +  // token_id
        32 + // authority
        32 + // mint
        (4 + 10) + // symbol
        (4 + 50) + // name
        1 +  // decimals
        8 +  // total_supply
        8 +  // split_multiplier
        TokenFeatures::LEN +
        1 +  // is_paused
        8 +  // upgrade_timelock
        8 +  // created_at
        1;   // bump
}

/// Multi-sig configuration for token admin
#[account]
pub struct MultisigConfig {
    /// Token this multisig controls
    pub token_config: Pubkey,
    /// List of authorized signers
    pub signers: Vec<Pubkey>,
    /// Required signatures (M of N)
    pub threshold: u8,
    /// Replay protection nonce
    pub nonce: u64,
    /// PDA bump
    pub bump: u8,
}

impl MultisigConfig {
    pub const MAX_SIGNERS: usize = 10;
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        (4 + 32 * Self::MAX_SIGNERS) + // signers vec
        1 +  // threshold
        8 +  // nonce
        1;   // bump
}

pub const TOKEN_CONFIG_SEED: &[u8] = b"token_config";
pub const MULTISIG_SEED: &[u8] = b"multisig";

#[derive(Accounts)]
#[instruction(params: CreateTokenParams)]
pub struct CreateToken<'info> {
    #[account(
        mut,
        seeds = [FACTORY_SEED],
        bump = factory.bump,
    )]
    pub factory: Account<'info, TokenFactory>,

    #[account(
        init,
        payer = payer,
        space = TokenConfig::LEN,
        seeds = [TOKEN_CONFIG_SEED, factory.key().as_ref(), &factory.token_count.to_le_bytes()],
        bump
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        init,
        payer = payer,
        space = MultisigConfig::LEN,
        seeds = [MULTISIG_SEED, token_config.key().as_ref()],
        bump
    )]
    pub multisig: Account<'info, MultisigConfig>,

    /// The mint account for the new token (Token-2022)
    #[account(
        init,
        payer = payer,
        mint::decimals = params.decimals,
        mint::authority = token_config,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
    let factory = &mut ctx.accounts.factory;

    // Validations
    require!(!factory.paused, FactoryError::FactoryPaused);
    require!(!params.symbol.is_empty(), FactoryError::SymbolEmpty);
    require!(params.symbol.len() <= 10, FactoryError::SymbolTooLong);
    require!(params.name.len() <= 50, FactoryError::NameTooLong);
    require!(params.initial_supply > 0, FactoryError::ZeroSupply);
    require!(params.admin_signers.len() <= MultisigConfig::MAX_SIGNERS, FactoryError::TooManySigners);
    require!(params.admin_threshold >= 1, FactoryError::ThresholdTooLow);
    require!(
        params.admin_signers.len() >= params.admin_threshold as usize,
        FactoryError::InvalidThreshold
    );

    // Get token ID and increment counter
    let token_id = factory.token_count;
    factory.token_count = factory.token_count
        .checked_add(1)
        .ok_or(FactoryError::MathOverflow)?;

    // Initialize token config
    let token_config = &mut ctx.accounts.token_config;
    token_config.factory = factory.key();
    token_config.token_id = token_id;
    token_config.authority = ctx.accounts.multisig.key();
    token_config.mint = ctx.accounts.mint.key();
    token_config.symbol = params.symbol.clone();
    token_config.name = params.name.clone();
    token_config.decimals = params.decimals;
    token_config.total_supply = params.initial_supply;
    token_config.split_multiplier = 1;
    token_config.features = params.features.clone();
    token_config.is_paused = false;
    token_config.upgrade_timelock = 86400; // 24 hours default
    token_config.created_at = Clock::get()?.unix_timestamp;
    token_config.bump = ctx.bumps.token_config;

    // Initialize multi-sig for this token
    let multisig = &mut ctx.accounts.multisig;
    multisig.token_config = token_config.key();
    multisig.signers = params.admin_signers.clone();
    multisig.threshold = params.admin_threshold;
    multisig.nonce = 0;
    multisig.bump = ctx.bumps.multisig;

    let clock = Clock::get()?;

    emit!(TokenCreated {
        factory: factory.key(),
        token_id,
        symbol: params.symbol,
        name: params.name,
        mint: ctx.accounts.mint.key(),
        token_config: token_config.key(),
        initial_supply: params.initial_supply,
        features: params.features,
        admin_threshold: params.admin_threshold,
        created_by: ctx.accounts.payer.key(),
        slot: clock.slot,
    });

    msg!("Token created: {} (ID: {})", token_config.symbol, token_id);

    Ok(())
}
