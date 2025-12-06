use anchor_lang::prelude::*;

#[error_code]
pub enum FactoryError {
    #[msg("Factory is paused")]
    FactoryPaused,

    #[msg("Symbol cannot be empty")]
    SymbolEmpty,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("Name too long (max 50 characters)")]
    NameTooLong,

    #[msg("Initial supply must be greater than zero")]
    ZeroSupply,

    #[msg("Invalid threshold - must have at least threshold signers")]
    InvalidThreshold,

    #[msg("Template ID mismatch")]
    TemplateMismatch,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Unauthorized - only factory authority can perform this action")]
    Unauthorized,

    #[msg("Template name too long (max 50 characters)")]
    TemplateNameTooLong,

    #[msg("Template description too long (max 200 characters)")]
    TemplateDescriptionTooLong,

    #[msg("Too many admin signers (max 10)")]
    TooManySigners,

    #[msg("Threshold must be at least 1")]
    ThresholdTooLow,
}
