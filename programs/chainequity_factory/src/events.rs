use anchor_lang::prelude::*;
use crate::state::TokenFeatures;

#[event]
pub struct FactoryInitialized {
    pub authority: Pubkey,
    pub creation_fee: u64,
}

#[event]
pub struct TokenCreated {
    pub factory: Pubkey,
    pub token_id: u64,
    pub symbol: String,
    pub name: String,
    pub mint: Pubkey,
    pub token_config: Pubkey,
    pub initial_supply: u64,
    pub features: TokenFeatures,
    pub admin_threshold: u8,
    pub created_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct TemplateCreated {
    pub template_id: u8,
    pub name: String,
    pub created_by: Pubkey,
}

#[event]
pub struct FactoryPausedChanged {
    pub paused: bool,
    pub changed_by: Pubkey,
}
