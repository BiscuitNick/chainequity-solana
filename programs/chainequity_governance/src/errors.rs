use anchor_lang::prelude::*;

#[error_code]
pub enum GovernanceError {
    #[msg("Insufficient tokens to create proposal")]
    InsufficientTokens,

    #[msg("Voting has not started yet")]
    VotingNotStarted,

    #[msg("Voting has ended")]
    VotingEnded,

    #[msg("Already voted on this proposal")]
    AlreadyVoted,

    #[msg("Proposal is not in active voting state")]
    ProposalNotActive,

    #[msg("Proposal has not passed")]
    ProposalNotPassed,

    #[msg("Execution delay not elapsed")]
    ExecutionDelayNotElapsed,

    #[msg("Execution window has passed")]
    ExecutionWindowPassed,

    #[msg("Only proposer can cancel")]
    NotProposer,

    #[msg("Cannot cancel after voting started")]
    VotingAlreadyStarted,

    #[msg("Description too long (max 500 characters)")]
    DescriptionTooLong,

    #[msg("Feature not enabled for this token")]
    FeatureDisabled,

    #[msg("Quorum not reached")]
    QuorumNotReached,

    #[msg("Proposal already executed")]
    AlreadyExecuted,

    #[msg("Invalid token config")]
    InvalidTokenConfig,
}
