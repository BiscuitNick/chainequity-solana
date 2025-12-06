use anchor_lang::prelude::*;
use crate::state::{AllowlistStatus, TerminationType, VestingType};

// ============================================================================
// ALLOWLIST EVENTS
// ============================================================================

#[event]
pub struct WalletApproved {
    pub token_config: Pubkey,
    pub wallet: Pubkey,
    pub kyc_level: u8,
    pub approved_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct WalletRevoked {
    pub token_config: Pubkey,
    pub wallet: Pubkey,
    pub revoked_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct AllowlistStatusChanged {
    pub token_config: Pubkey,
    pub wallet: Pubkey,
    pub old_status: AllowlistStatus,
    pub new_status: AllowlistStatus,
    pub changed_by: Pubkey,
    pub slot: u64,
}

// ============================================================================
// TRANSFER EVENTS
// ============================================================================

#[event]
pub struct TokensMinted {
    pub token_config: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub new_total_supply: u64,
    pub minted_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct TokensTransferred {
    pub token_config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

#[event]
pub struct TransferBlocked {
    pub token_config: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub reason: String,
    pub slot: u64,
}

// ============================================================================
// VESTING EVENTS
// ============================================================================

#[event]
pub struct VestingScheduleCreated {
    pub token_config: Pubkey,
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub total_amount: u64,
    pub start_time: i64,
    pub cliff_duration: u64,
    pub total_duration: u64,
    pub vesting_type: VestingType,
    pub created_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct VestedTokensReleased {
    pub token_config: Pubkey,
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_released: u64,
    pub total_released: u64,
    pub slot: u64,
}

#[event]
pub struct VestingTerminated {
    pub token_config: Pubkey,
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub termination_type: TerminationType,
    pub final_vested: u64,
    pub returned_to_treasury: u64,
    pub terminated_at: i64,
    pub terminated_by: Pubkey,
    pub slot: u64,
}

// ============================================================================
// RESTRICTION EVENTS
// ============================================================================

#[event]
pub struct WalletRestrictionsUpdated {
    pub token_config: Pubkey,
    pub wallet: Pubkey,
    pub daily_limit: Option<u64>,
    pub lockout_until: Option<i64>,
    pub max_balance: Option<u64>,
    pub updated_by: Pubkey,
    pub slot: u64,
}

// ============================================================================
// DIVIDEND EVENTS
// ============================================================================

#[event]
pub struct DividendRoundCreated {
    pub token_config: Pubkey,
    pub round: Pubkey,
    pub round_id: u64,
    pub payment_token: Pubkey,
    pub total_pool: u64,
    pub amount_per_share: u64,
    pub snapshot_slot: u64,
    pub expires_at: Option<i64>,
    pub created_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct DividendClaimed {
    pub token_config: Pubkey,
    pub round: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub slot: u64,
}

// ============================================================================
// CORPORATE ACTION EVENTS
// ============================================================================

#[event]
pub struct StockSplitExecuted {
    pub token_config: Pubkey,
    pub split_ratio: u8,
    pub old_total_supply: u64,
    pub new_total_supply: u64,
    pub accounts_updated: u32,
    pub executed_by: Pubkey,
    pub slot: u64,
}

#[event]
pub struct SplitBatchProcessed {
    pub token_config: Pubkey,
    pub batch_index: u32,
    pub accounts_processed: u32,
    pub slot: u64,
}

#[event]
pub struct SymbolChanged {
    pub token_config: Pubkey,
    pub old_symbol: String,
    pub new_symbol: String,
    pub changed_by: Pubkey,
    pub slot: u64,
}

// ============================================================================
// ADMIN EVENTS
// ============================================================================

#[event]
pub struct TokenPausedChanged {
    pub token_config: Pubkey,
    pub paused: bool,
    pub changed_by: Pubkey,
    pub slot: u64,
}
