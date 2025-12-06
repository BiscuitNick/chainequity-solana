use anchor_lang::prelude::*;
use crate::state::{TokenFactory, FACTORY_SEED};
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
