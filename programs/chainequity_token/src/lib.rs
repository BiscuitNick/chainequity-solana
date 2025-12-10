use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;
use state::*;

declare_id!("5H3QcvZsViboQzqnv2vLjqCNyCgQ4sx3UXmYgDihTmLV");

#[program]
pub mod chainequity_token {
    use super::*;

    // =========================================================================
    // ALLOWLIST MANAGEMENT
    // =========================================================================

    /// Add a wallet to the allowlist
    pub fn add_to_allowlist(ctx: Context<AddToAllowlist>) -> Result<()> {
        instructions::allowlist::add_handler(ctx)
    }

    /// Remove a wallet from the allowlist
    pub fn remove_from_allowlist(ctx: Context<RemoveFromAllowlist>) -> Result<()> {
        instructions::allowlist::remove_handler(ctx)
    }

    /// Update allowlist status
    pub fn update_allowlist_status(
        ctx: Context<UpdateAllowlistStatus>,
        status: AllowlistStatus,
    ) -> Result<()> {
        instructions::allowlist::update_status_handler(ctx, status)
    }

    // =========================================================================
    // TOKEN OPERATIONS
    // =========================================================================

    /// Mint tokens to an approved wallet
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    /// Transfer tokens between approved wallets
    pub fn transfer_tokens(
        ctx: Context<TransferTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer::handler(ctx, amount)
    }

    // =========================================================================
    // VESTING
    // =========================================================================

    /// Create a vesting schedule
    pub fn create_vesting_schedule(
        ctx: Context<CreateVestingSchedule>,
        params: VestingParams,
    ) -> Result<()> {
        instructions::vesting::create_handler(ctx, params)
    }

    /// Release vested tokens
    pub fn release_vested_tokens(ctx: Context<ReleaseVestedTokens>) -> Result<()> {
        instructions::vesting::release_handler(ctx)
    }

    /// Terminate a vesting schedule
    pub fn terminate_vesting(
        ctx: Context<TerminateVesting>,
        termination_type: TerminationType,
        notes: Option<String>,
    ) -> Result<()> {
        instructions::vesting::terminate_handler(ctx, termination_type, notes)
    }

    // =========================================================================
    // RESTRICTIONS
    // =========================================================================

    /// Set wallet restrictions (daily limit, lockout)
    pub fn set_wallet_restrictions(
        ctx: Context<SetWalletRestrictions>,
        daily_limit: Option<u64>,
        lockout_until: Option<i64>,
        max_balance: Option<u64>,
    ) -> Result<()> {
        instructions::restrictions::set_handler(ctx, daily_limit, lockout_until, max_balance)
    }

    // =========================================================================
    // CORPORATE ACTIONS
    // =========================================================================

    /// Execute a stock split
    pub fn execute_split_batch(
        ctx: Context<ExecuteSplitBatch>,
        split_ratio: u8,
        batch_index: u32,
    ) -> Result<()> {
        instructions::corporate_actions::split_batch_handler(ctx, split_ratio, batch_index)
    }

    /// Finalize a stock split
    pub fn finalize_split(
        ctx: Context<FinalizeSplit>,
        split_ratio: u8,
    ) -> Result<()> {
        instructions::corporate_actions::finalize_split_handler(ctx, split_ratio)
    }

    /// Change token symbol
    pub fn change_symbol(
        ctx: Context<ChangeSymbol>,
        new_symbol: String,
    ) -> Result<()> {
        instructions::corporate_actions::change_symbol_handler(ctx, new_symbol)
    }

    // =========================================================================
    // DIVIDENDS
    // =========================================================================

    /// Create a dividend round
    pub fn create_dividend_round(
        ctx: Context<CreateDividendRound>,
        round_id: u64,
        total_pool: u64,
        expires_in_seconds: Option<u64>,
    ) -> Result<()> {
        instructions::dividends::create_round_handler(ctx, round_id, total_pool, expires_in_seconds)
    }

    /// Claim dividend
    pub fn claim_dividend(ctx: Context<ClaimDividend>) -> Result<()> {
        instructions::dividends::claim_handler(ctx)
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// Pause/unpause token transfers
    pub fn set_token_paused(ctx: Context<SetTokenPaused>, paused: bool) -> Result<()> {
        instructions::admin::set_paused_handler(ctx, paused)
    }

    /// Initialize mint authority - transfers mint authority from token_config to a PDA
    /// owned by the token program. Must be called once after token creation.
    pub fn initialize_mint_authority(ctx: Context<InitializeMintAuthority>) -> Result<()> {
        instructions::admin::initialize_mint_authority_handler(ctx)
    }
}
