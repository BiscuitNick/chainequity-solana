use anchor_lang::prelude::*;
use crate::state::{TokenFactory, TokenTemplate, CreateTemplateParams, FACTORY_SEED, TEMPLATE_SEED};
use crate::errors::FactoryError;
use crate::events::TemplateCreated;

#[derive(Accounts)]
#[instruction(params: CreateTemplateParams)]
pub struct CreateTemplate<'info> {
    #[account(
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority @ FactoryError::Unauthorized,
    )]
    pub factory: Account<'info, TokenFactory>,

    #[account(
        init,
        payer = authority,
        space = TokenTemplate::LEN,
        seeds = [TEMPLATE_SEED, &[params.id]],
        bump
    )]
    pub template: Account<'info, TokenTemplate>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_handler(ctx: Context<CreateTemplate>, params: CreateTemplateParams) -> Result<()> {
    require!(params.name.len() <= 50, FactoryError::TemplateNameTooLong);
    require!(params.description.len() <= 200, FactoryError::TemplateDescriptionTooLong);

    let template = &mut ctx.accounts.template;

    template.id = params.id;
    template.name = params.name.clone();
    template.description = params.description;
    template.features = params.features;
    template.default_vesting = params.default_vesting;
    template.default_restrictions = params.default_restrictions;
    template.bump = ctx.bumps.template;

    emit!(TemplateCreated {
        template_id: params.id,
        name: params.name,
        created_by: ctx.accounts.authority.key(),
    });

    msg!("Template created: {} (ID: {})", template.name, template.id);

    Ok(())
}
