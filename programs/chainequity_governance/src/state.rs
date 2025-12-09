use anchor_lang::prelude::*;

/// Governance configuration per token
#[account]
pub struct GovernanceConfig {
    /// Token this governance is for
    pub token_config: Pubkey,
    /// Minimum tokens to create proposal (e.g., 1% of supply)
    pub min_proposal_threshold: u64,
    /// Seconds after creation before voting starts
    pub voting_delay: u64,
    /// Seconds voting is open
    pub voting_period: u64,
    /// Percentage of supply that must vote (e.g., 10)
    pub quorum_percentage: u8,
    /// Percentage of votes needed to pass (e.g., 66)
    pub approval_threshold: u8,
    /// Seconds after passing before execution allowed
    pub execution_delay: u64,
    /// Seconds window to execute after delay
    pub execution_window: u64,
    /// Total proposals created
    pub proposal_count: u64,
    /// PDA bump
    pub bump: u8,
}

impl GovernanceConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // token_config
        8 +  // min_proposal_threshold
        8 +  // voting_delay
        8 +  // voting_period
        1 +  // quorum_percentage
        1 +  // approval_threshold
        8 +  // execution_delay
        8 +  // execution_window
        8 +  // proposal_count
        1;   // bump
}

/// A governance proposal
#[account]
pub struct Proposal {
    /// Sequential proposal ID
    pub id: u64,
    /// Token this proposal is for
    pub token_config: Pubkey,
    /// Who created the proposal
    pub proposer: Pubkey,
    /// The action to execute if passed
    pub action: GovernanceAction,
    /// Human-readable description
    pub description: String,
    /// Weighted votes in favor
    pub votes_for: u64,
    /// Weighted votes against
    pub votes_against: u64,
    /// Weighted abstentions
    pub votes_abstain: u64,
    /// Current status
    pub status: ProposalStatus,
    /// When voting opens
    pub voting_starts: i64,
    /// When voting closes
    pub voting_ends: i64,
    /// Seconds after passing before execution
    pub execution_delay: u64,
    /// When executed (if passed)
    pub executed_at: Option<i64>,
    /// Block for voting power snapshot
    pub snapshot_slot: u64,
    /// PDA bump
    pub bump: u8,
}

impl Proposal {
    pub const LEN: usize = 8 + // discriminator
        8 +  // id
        32 + // token_config
        32 + // proposer
        GovernanceAction::LEN +
        (4 + 500) + // description
        8 +  // votes_for
        8 +  // votes_against
        8 +  // votes_abstain
        1 +  // status
        8 +  // voting_starts
        8 +  // voting_ends
        8 +  // execution_delay
        (1 + 8) + // executed_at Option<i64>
        8 +  // snapshot_slot
        1;   // bump
}

/// Actions that can be proposed via governance
/// Limited to core corporate actions that benefit from shareholder voting
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum GovernanceAction {
    /// Initiate a stock split (e.g., 7-for-1)
    InitiateStockSplit { multiplier: u8 },
    /// Change the token symbol
    UpdateSymbol { new_symbol: String },
    /// Initiate a dividend distribution
    InitiateDividend { payment_token: Pubkey, total_amount: u64 },
}

impl GovernanceAction {
    pub const LEN: usize = 1 + 32 + 8 + 10; // Enum variant + largest payload
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default, Debug)]
pub enum ProposalStatus {
    #[default]
    Pending,
    Active,
    Passed,
    Failed,
    Executed,
    Cancelled,
}

/// Record of a vote
#[account]
pub struct VoteRecord {
    /// Proposal voted on
    pub proposal: Pubkey,
    /// Who voted
    pub voter: Pubkey,
    /// How they voted
    pub vote: Vote,
    /// Voting power used
    pub weight: u64,
    /// When they voted
    pub voted_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl VoteRecord {
    pub const LEN: usize = 8 + // discriminator
        32 + // proposal
        32 + // voter
        1 +  // vote
        8 +  // weight
        8 +  // voted_at
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Vote {
    For,
    Against,
    Abstain,
}

// PDA Seeds
pub const GOVERNANCE_CONFIG_SEED: &[u8] = b"governance_config";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const VOTE_RECORD_SEED: &[u8] = b"vote_record";
