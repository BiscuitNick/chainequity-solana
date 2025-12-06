use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::errors::TokenError;
use crate::events::{StockSplitExecuted, SplitBatchProcessed, SymbolChanged};

#[derive(Accounts)]
pub struct ExecuteSplitBatch<'info> {
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    // Remaining accounts: token accounts to process in this batch
}

pub fn split_batch_handler(
    ctx: Context<ExecuteSplitBatch>,
    split_ratio: u8,
    batch_index: u32,
) -> Result<()> {
    require!(split_ratio > 1, TokenError::InvalidSplitRatio);

    let clock = Clock::get()?;
    let accounts_processed = ctx.remaining_accounts.len() as u32;

    // In production, would iterate through remaining_accounts and mint additional tokens
    // to each holder based on split_ratio

    emit!(SplitBatchProcessed {
        token_config: ctx.accounts.token_config.key(),
        batch_index,
        accounts_processed,
        slot: clock.slot,
    });

    msg!("Processed split batch {} with {} accounts", batch_index, accounts_processed);

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeSplit<'info> {
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn finalize_split_handler(
    ctx: Context<FinalizeSplit>,
    split_ratio: u8,
) -> Result<()> {
    require!(split_ratio > 1, TokenError::InvalidSplitRatio);

    let token_config = &mut ctx.accounts.token_config;
    let old_supply = token_config.total_supply;

    // Update total supply
    token_config.total_supply = old_supply
        .checked_mul(split_ratio as u64)
        .ok_or(TokenError::MathOverflow)?;

    // Update split multiplier for tracking
    token_config.split_multiplier = token_config.split_multiplier
        .checked_mul(split_ratio as u64)
        .ok_or(TokenError::MathOverflow)?;

    let clock = Clock::get()?;

    emit!(StockSplitExecuted {
        token_config: token_config.key(),
        split_ratio,
        old_total_supply: old_supply,
        new_total_supply: token_config.total_supply,
        accounts_updated: 0, // Would track actual count
        executed_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Finalized {}:1 stock split. New supply: {}",
        split_ratio, token_config.total_supply
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ChangeSymbol<'info> {
    #[account(mut)]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn change_symbol_handler(
    ctx: Context<ChangeSymbol>,
    new_symbol: String,
) -> Result<()> {
    require!(!new_symbol.is_empty(), TokenError::SymbolEmpty);
    require!(new_symbol.len() <= 10, TokenError::SymbolTooLong);

    let token_config = &mut ctx.accounts.token_config;
    let old_symbol = token_config.symbol.clone();
    token_config.symbol = new_symbol.clone();

    let clock = Clock::get()?;

    // In production, would also update Token-2022 metadata extension

    emit!(SymbolChanged {
        token_config: token_config.key(),
        old_symbol,
        new_symbol: new_symbol.clone(),
        changed_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Changed symbol to: {}", new_symbol);

    Ok(())
}
