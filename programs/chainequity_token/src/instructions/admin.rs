use anchor_lang::prelude::*;
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::errors::TokenError;
use crate::events::TokenPausedChanged;

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
