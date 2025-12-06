use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;
use state::{CreateTokenParams, CreateTemplateParams, TransactionType};

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

    // ============================================
    // Multi-Sig Instructions
    // ============================================

    /// Initialize a multi-sig wallet for token administration
    pub fn init_multisig(
        ctx: Context<InitMultiSig>,
        signers: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        instructions::multisig::init_multisig(ctx, signers, threshold)
    }

    /// Create a new multi-sig transaction proposal
    pub fn create_multisig_transaction(
        ctx: Context<CreateTransaction>,
        transaction_type: TransactionType,
        deadline: Option<i64>,
    ) -> Result<()> {
        instructions::multisig::create_transaction(ctx, transaction_type, deadline)
    }

    /// Approve a pending multi-sig transaction
    pub fn approve_multisig_transaction(
        ctx: Context<ApproveTransaction>,
    ) -> Result<()> {
        instructions::multisig::approve_transaction(ctx)
    }

    /// Execute a multi-sig transaction after reaching threshold
    pub fn execute_multisig_transaction(
        ctx: Context<ExecuteTransaction>,
    ) -> Result<()> {
        instructions::multisig::execute_transaction(ctx)
    }

    /// Cancel a pending multi-sig transaction
    pub fn cancel_multisig_transaction(
        ctx: Context<CancelTransaction>,
    ) -> Result<()> {
        instructions::multisig::cancel_transaction(ctx)
    }
}
