use anchor_lang::prelude::*;
use crate::state::{TokenFactory, FACTORY_SEED};
use crate::events::FactoryInitialized;

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(
        init,
        payer = authority,
        space = TokenFactory::LEN,
        seeds = [FACTORY_SEED],
        bump
    )]
    pub factory: Account<'info, TokenFactory>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeFactory>, creation_fee: u64) -> Result<()> {
    let factory = &mut ctx.accounts.factory;

    factory.authority = ctx.accounts.authority.key();
    factory.token_count = 0;
    factory.creation_fee = creation_fee;
    factory.fee_recipient = ctx.accounts.authority.key();
    factory.paused = false;
    factory.bump = ctx.bumps.factory;

    emit!(FactoryInitialized {
        authority: factory.authority,
        creation_fee,
    });

    msg!("Factory initialized with authority: {}", factory.authority);

    Ok(())
}
