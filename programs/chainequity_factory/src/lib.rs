use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod chainequity_factory {
    use super::*;

    /// Initialize the token factory (called once at deployment)
    pub fn initialize_factory(
        ctx: Context<InitializeFactory>,
        creation_fee: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, creation_fee)
    }

    /// Create a new security token
    pub fn create_token(
        ctx: Context<CreateToken>,
        params: CreateTokenParams,
    ) -> Result<()> {
        instructions::create_token::handler(ctx, params)
    }

    /// Create a token template for quick creation
    pub fn create_template(
        ctx: Context<CreateTemplate>,
        params: CreateTemplateParams,
    ) -> Result<()> {
        instructions::templates::create_handler(ctx, params)
    }

    /// Pause/unpause factory (emergency)
    pub fn set_factory_paused(
        ctx: Context<SetFactoryPaused>,
        paused: bool,
    ) -> Result<()> {
        instructions::admin::set_paused_handler(ctx, paused)
    }
}
