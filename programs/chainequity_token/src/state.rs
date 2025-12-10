use anchor_lang::prelude::*;

// ============================================================================
// ALLOWLIST
// ============================================================================

/// Allowlist entry for a wallet
#[account]
pub struct AllowlistEntry {
    /// Token config this belongs to
    pub token_config: Pubkey,
    /// Approved wallet address
    pub wallet: Pubkey,
    /// Timestamp of approval
    pub approved_at: i64,
    /// Admin who approved
    pub approved_by: Pubkey,
    /// Current status
    pub status: AllowlistStatus,
    /// PDA bump
    pub bump: u8,
}

impl AllowlistEntry {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        32 + // wallet
        8 +  // approved_at
        32 + // approved_by
        1 +  // status enum
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum AllowlistStatus {
    #[default]
    Pending,
    Active,
    Revoked,
    Suspended,
}

// ============================================================================
// WALLET RESTRICTIONS
// ============================================================================

/// Per-wallet transfer restrictions
#[account]
pub struct WalletRestrictions {
    /// Token config this belongs to
    pub token_config: Pubkey,
    /// Wallet address
    pub wallet: Pubkey,
    /// Max daily transfer (None = unlimited)
    pub daily_transfer_limit: Option<u64>,
    /// Running daily total
    pub transferred_today: u64,
    /// Day boundary (unix timestamp of day start)
    pub last_transfer_day: i64,
    /// Cannot transfer until (None = no lockout)
    pub lockout_until: Option<i64>,
    /// Maximum holdings (None = unlimited)
    pub max_balance: Option<u64>,
    /// PDA bump
    pub bump: u8,
}

impl WalletRestrictions {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        32 + // wallet
        (1 + 8) + // daily_transfer_limit Option<u64>
        8 +  // transferred_today
        8 +  // last_transfer_day
        (1 + 8) + // lockout_until Option<i64>
        (1 + 8) + // max_balance Option<u64>
        1;   // bump
}

// ============================================================================
// VESTING
// ============================================================================

/// Vesting schedule for a beneficiary
#[account]
pub struct VestingSchedule {
    /// Token config this belongs to
    pub token_config: Pubkey,
    /// Wallet receiving vested tokens
    pub beneficiary: Pubkey,
    /// Total tokens in schedule
    pub total_amount: u64,
    /// Already released
    pub released_amount: u64,
    /// Vesting start (unix timestamp)
    pub start_time: i64,
    /// Seconds until cliff (0 = no cliff)
    pub cliff_duration: u64,
    /// Total vesting duration in seconds
    pub total_duration: u64,
    /// Vesting type
    pub vesting_type: VestingType,
    /// Can issuer revoke unvested?
    pub revocable: bool,
    /// Has it been revoked/terminated?
    pub revoked: bool,
    /// Termination type (if terminated)
    pub termination_type: Option<TerminationType>,
    /// Unix timestamp of termination
    pub terminated_at: Option<i64>,
    /// Admin who terminated
    pub terminated_by: Option<Pubkey>,
    /// Snapshot of vested amount at termination
    pub vested_at_termination: Option<u64>,
    /// Audit trail notes (max 200 chars)
    pub termination_notes: Option<String>,
    /// PDA bump
    pub bump: u8,
}

impl VestingSchedule {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        32 + // beneficiary
        8 +  // total_amount
        8 +  // released_amount
        8 +  // start_time
        8 +  // cliff_duration
        8 +  // total_duration
        1 +  // vesting_type
        1 +  // revocable
        1 +  // revoked
        (1 + 1) + // termination_type Option<enum>
        (1 + 8) + // terminated_at Option<i64>
        (1 + 32) + // terminated_by Option<Pubkey>
        (1 + 8) + // vested_at_termination Option<u64>
        (1 + 4 + 200) + // termination_notes Option<String>
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum VestingType {
    #[default]
    Linear,
    CliffThenLinear,
    Stepped,
}

/// Termination types (simplified to 3)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TerminationType {
    /// Standard departure - keep vested, lose unvested
    Standard,
    /// For cause - forfeit ALL tokens
    ForCause,
    /// Accelerated - 100% vests immediately
    Accelerated,
}

/// Parameters for creating a vesting schedule
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VestingParams {
    pub total_amount: u64,
    pub start_time: i64,
    pub cliff_duration: u64,
    pub total_duration: u64,
    pub vesting_type: VestingType,
    pub revocable: bool,
}

// ============================================================================
// DIVIDENDS
// ============================================================================

/// Dividend distribution round
#[account]
pub struct DividendRound {
    /// Token config this belongs to
    pub token_config: Pubkey,
    /// Sequential round ID
    pub id: u64,
    /// Payment token mint (e.g., TestUSDC)
    pub payment_token: Pubkey,
    /// Total dividend amount
    pub total_pool: u64,
    /// Block for ownership snapshot
    pub snapshot_slot: u64,
    /// Calculated: pool / supply
    pub amount_per_share: u64,
    /// Round status
    pub status: DividendStatus,
    /// Creation timestamp
    pub created_at: i64,
    /// Claim deadline (None = no expiry)
    pub expires_at: Option<i64>,
    /// PDA bump
    pub bump: u8,
}

impl DividendRound {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        8 +  // id
        32 + // payment_token
        8 +  // total_pool
        8 +  // snapshot_slot
        8 +  // amount_per_share
        1 +  // status
        8 +  // created_at
        (1 + 8) + // expires_at Option<i64>
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum DividendStatus {
    #[default]
    Pending,
    Active,
    Completed,
}

/// Record of a dividend claim
#[account]
pub struct DividendClaim {
    /// Dividend round
    pub round: Pubkey,
    /// Claimant wallet
    pub wallet: Pubkey,
    /// Amount claimed
    pub amount: u64,
    /// Claim timestamp
    pub claimed_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl DividendClaim {
    pub const LEN: usize = 8 + // discriminator
        32 + // round
        32 + // wallet
        8 +  // amount
        8 +  // claimed_at
        1;   // bump
}

// ============================================================================
// PDA SEEDS
// ============================================================================

pub const ALLOWLIST_SEED: &[u8] = b"allowlist";
pub const RESTRICTIONS_SEED: &[u8] = b"restrictions";
pub const VESTING_SEED: &[u8] = b"vesting";
pub const VESTING_ESCROW_SEED: &[u8] = b"vesting_escrow";
pub const DIVIDEND_ROUND_SEED: &[u8] = b"dividend_round";
pub const DIVIDEND_CLAIM_SEED: &[u8] = b"dividend_claim";
pub const DIVIDEND_POOL_SEED: &[u8] = b"dividend_pool";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";

// ============================================================================
// MINT AUTHORITY
// ============================================================================

/// Mint authority PDA for a token - allows the token program to sign mint operations
#[account]
pub struct MintAuthority {
    /// The token config this mint authority is for
    pub token_config: Pubkey,
    /// The mint this authority controls
    pub mint: Pubkey,
    /// PDA bump
    pub bump: u8,
}

impl MintAuthority {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        32 + // mint
        1;   // bump
}
