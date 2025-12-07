use anchor_lang::prelude::*;

#[error_code]
pub enum TokenError {
    // Allowlist errors
    #[msg("Wallet is not on the allowlist")]
    NotOnAllowlist,

    #[msg("Wallet is not active on allowlist")]
    WalletNotActive,

    #[msg("Sender is not approved for transfers")]
    SenderNotApproved,

    #[msg("Recipient is not approved for transfers")]
    RecipientNotApproved,

    #[msg("Wallet is already on allowlist")]
    AlreadyOnAllowlist,

    // Transfer errors
    #[msg("Token transfers are paused")]
    TransfersPaused,

    #[msg("Wallet is in lockout period")]
    InLockoutPeriod,

    #[msg("Transfer exceeds daily limit")]
    DailyLimitExceeded,

    #[msg("Transfer would exceed maximum balance")]
    MaxBalanceExceeded,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Cannot transfer unvested tokens")]
    UnvestedTokensLocked,

    // Vesting errors
    #[msg("Vesting schedule already terminated")]
    AlreadyTerminated,

    #[msg("Vesting schedule is not revocable")]
    NotRevocable,

    #[msg("No tokens available to release")]
    NoTokensToRelease,

    #[msg("Cliff period not yet reached")]
    CliffNotReached,

    #[msg("Invalid vesting duration")]
    InvalidVestingDuration,

    #[msg("Termination notes too long (max 200 characters)")]
    TerminationNotesTooLong,

    #[msg("This feature is not enabled for this token")]
    FeatureDisabled,

    // Dividend errors
    #[msg("Dividend already claimed")]
    AlreadyClaimed,

    #[msg("Dividend round expired")]
    DividendExpired,

    #[msg("Dividend round is not active")]
    DividendNotActive,

    #[msg("No dividend entitlement")]
    NoEntitlement,

    #[msg("Insufficient funds in source account")]
    InsufficientFunds,

    #[msg("Insufficient funds in dividend pool")]
    InsufficientPoolFunds,

    // Corporate action errors
    #[msg("Invalid split ratio")]
    InvalidSplitRatio,

    #[msg("Split already in progress")]
    SplitInProgress,

    #[msg("Symbol cannot be empty")]
    SymbolEmpty,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    // General errors
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid amount")]
    InvalidAmount,
}
