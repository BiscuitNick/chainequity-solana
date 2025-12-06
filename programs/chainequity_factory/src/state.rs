use anchor_lang::prelude::*;

/// Global factory configuration - one per platform deployment
#[account]
#[derive(Default)]
pub struct TokenFactory {
    /// Platform admin (can be multi-sig)
    pub authority: Pubkey,
    /// Total tokens created (for sequential IDs)
    pub token_count: u64,
    /// Fee to create token (0 for demo)
    pub creation_fee: u64,
    /// Where fees go
    pub fee_recipient: Pubkey,
    /// Emergency pause
    pub paused: bool,
    /// PDA bump
    pub bump: u8,
}

impl TokenFactory {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        8 +  // token_count
        8 +  // creation_fee
        32 + // fee_recipient
        1 +  // paused
        1;   // bump
}

/// Template for quick token creation with preset configurations
#[account]
pub struct TokenTemplate {
    /// Template ID
    pub id: u8,
    /// Template name (max 50 chars)
    pub name: String,
    /// Template description (max 200 chars)
    pub description: String,
    /// Default feature flags
    pub features: TokenFeatures,
    /// Default vesting configuration
    pub default_vesting: Option<DefaultVestingConfig>,
    /// Default restrictions
    pub default_restrictions: Option<DefaultRestrictions>,
    /// PDA bump
    pub bump: u8,
}

impl TokenTemplate {
    pub const LEN: usize = 8 + // discriminator
        1 +   // id
        (4 + 50) +  // name (string prefix + max chars)
        (4 + 200) + // description
        TokenFeatures::LEN +
        (1 + DefaultVestingConfig::LEN) + // Option<DefaultVestingConfig>
        (1 + DefaultRestrictions::LEN) +  // Option<DefaultRestrictions>
        1;    // bump
}

/// Feature flags for token creation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, PartialEq)]
pub struct TokenFeatures {
    /// Allow vesting schedules
    pub vesting_enabled: bool,
    /// Allow on-chain governance
    pub governance_enabled: bool,
    /// Allow dividend distribution
    pub dividends_enabled: bool,
    /// Daily limits, lockouts
    pub transfer_restrictions_enabled: bool,
    /// Can upgrade token program
    pub upgradeable: bool,
}

impl TokenFeatures {
    pub const LEN: usize = 5; // 5 bools
}

/// Default vesting configuration for templates
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DefaultVestingConfig {
    /// Default cliff in seconds (e.g., 1 year = 31536000)
    pub cliff_seconds: u64,
    /// Default duration in seconds (e.g., 4 years = 126144000)
    pub duration_seconds: u64,
    /// Default vesting type
    pub vesting_type: VestingType,
}

impl DefaultVestingConfig {
    pub const LEN: usize = 8 + 8 + 1; // u64 + u64 + enum
}

/// Default restrictions for templates
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DefaultRestrictions {
    /// Default daily limit as percentage of holdings (e.g., 1%)
    pub default_daily_limit_percent: Option<u8>,
    /// Default lockout in seconds (e.g., 6 months)
    pub default_lockout_seconds: Option<u64>,
}

impl DefaultRestrictions {
    pub const LEN: usize = (1 + 1) + (1 + 8); // Option<u8> + Option<u64>
}

/// Vesting types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, PartialEq)]
pub enum VestingType {
    #[default]
    Linear,
    CliffThenLinear,
    Stepped,
}

/// Parameters for creating a new token
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTokenParams {
    /// Token symbol (max 10 chars)
    pub symbol: String,
    /// Token name (max 50 chars)
    pub name: String,
    /// Token decimals (typically 0 for equity)
    pub decimals: u8,
    /// Initial token supply
    pub initial_supply: u64,
    /// Feature flags
    pub features: TokenFeatures,
    /// Multi-sig signers
    pub admin_signers: Vec<Pubkey>,
    /// Required signatures
    pub admin_threshold: u8,
    /// Optional template to use
    pub template_id: Option<u8>,
}

/// Parameters for creating a template
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTemplateParams {
    /// Template ID
    pub id: u8,
    /// Template name
    pub name: String,
    /// Template description
    pub description: String,
    /// Default features
    pub features: TokenFeatures,
    /// Default vesting config
    pub default_vesting: Option<DefaultVestingConfig>,
    /// Default restrictions
    pub default_restrictions: Option<DefaultRestrictions>,
}

/// Seeds for factory PDA
pub const FACTORY_SEED: &[u8] = b"factory";
/// Seeds for template PDA
pub const TEMPLATE_SEED: &[u8] = b"template";
/// Seeds for multisig PDA
pub const MULTISIG_SEED: &[u8] = b"multisig";
/// Seeds for transaction PDA
pub const TRANSACTION_SEED: &[u8] = b"transaction";

/// Multi-sig wallet configuration for admin operations
#[account]
pub struct MultiSig {
    /// Token this multi-sig controls
    pub token_mint: Pubkey,
    /// List of signers (max 10)
    pub signers: Vec<Pubkey>,
    /// Required number of signatures
    pub threshold: u8,
    /// Transaction counter for unique IDs
    pub transaction_count: u64,
    /// PDA bump
    pub bump: u8,
}

impl MultiSig {
    pub const MAX_SIGNERS: usize = 10;
    pub const LEN: usize = 8 + // discriminator
        32 + // token_mint
        (4 + 32 * Self::MAX_SIGNERS) + // signers vec
        1 +  // threshold
        8 +  // transaction_count
        1;   // bump
}

/// Pending multi-sig transaction
#[account]
pub struct MultiSigTransaction {
    /// Associated multi-sig account
    pub multisig: Pubkey,
    /// Transaction ID
    pub transaction_id: u64,
    /// Type of transaction
    pub transaction_type: TransactionType,
    /// Who approved
    pub approvers: Vec<Pubkey>,
    /// When created
    pub created_at: i64,
    /// Execution deadline (optional)
    pub deadline: Option<i64>,
    /// Whether executed
    pub executed: bool,
    /// PDA bump
    pub bump: u8,
}

impl MultiSigTransaction {
    pub const MAX_APPROVERS: usize = 10;
    pub const LEN: usize = 8 + // discriminator
        32 + // multisig
        8 +  // transaction_id
        TransactionType::MAX_LEN + // transaction_type
        (4 + 32 * Self::MAX_APPROVERS) + // approvers vec
        8 +  // created_at
        (1 + 8) + // deadline Option<i64>
        1 +  // executed
        1;   // bump
}

/// Types of multi-sig transactions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TransactionType {
    /// Add address to allowlist
    AllowlistAdd { address: Pubkey },
    /// Remove address from allowlist
    AllowlistRemove { address: Pubkey },
    /// Update investor restrictions
    UpdateRestrictions { address: Pubkey, daily_limit: Option<u64>, locked_until: Option<i64> },
    /// Terminate vesting schedule
    TerminateVesting { vesting_account: Pubkey, termination_type: u8 },
    /// Execute stock split
    StockSplit { numerator: u64, denominator: u64 },
    /// Change symbol
    SymbolChange { new_symbol: String },
    /// Pause/unpause token
    SetPaused { paused: bool },
    /// Update multi-sig threshold
    UpdateThreshold { new_threshold: u8 },
    /// Add signer to multi-sig
    AddSigner { new_signer: Pubkey },
    /// Remove signer from multi-sig
    RemoveSigner { signer: Pubkey },
}

impl TransactionType {
    pub const MAX_LEN: usize = 1 + // enum discriminant
        32 + // largest pubkey field
        8 + 8 + // UpdateRestrictions extra fields
        10; // SymbolChange string (max 10 chars)
}
