use anchor_lang::prelude::*;
use crate::state::{MultiSig, MultiSigTransaction, TransactionType, MULTISIG_SEED, TRANSACTION_SEED};
use crate::errors::FactoryError;

/// Initialize a multi-sig wallet for token administration
pub fn init_multisig(
    ctx: Context<InitMultiSig>,
    signers: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    require!(
        signers.len() >= threshold as usize,
        FactoryError::InvalidThreshold
    );
    require!(
        signers.len() <= MultiSig::MAX_SIGNERS,
        FactoryError::TooManySigners
    );
    require!(threshold > 0, FactoryError::InvalidThreshold);

    let multisig = &mut ctx.accounts.multisig;
    multisig.token_mint = ctx.accounts.token_mint.key();
    multisig.signers = signers;
    multisig.threshold = threshold;
    multisig.transaction_count = 0;
    multisig.bump = ctx.bumps.multisig;

    msg!("MultiSig initialized for token {} with threshold {}",
        ctx.accounts.token_mint.key(), threshold);

    Ok(())
}

/// Create a new multi-sig transaction proposal
pub fn create_transaction(
    ctx: Context<CreateTransaction>,
    transaction_type: TransactionType,
    deadline: Option<i64>,
) -> Result<()> {
    let multisig = &mut ctx.accounts.multisig;
    let transaction = &mut ctx.accounts.transaction;

    // Verify proposer is a signer
    let proposer = ctx.accounts.proposer.key();
    require!(
        multisig.signers.contains(&proposer),
        FactoryError::NotASigner
    );

    let transaction_id = multisig.transaction_count;
    multisig.transaction_count += 1;

    let clock = Clock::get()?;

    transaction.multisig = multisig.key();
    transaction.transaction_id = transaction_id;
    transaction.transaction_type = transaction_type;
    transaction.approvers = vec![proposer]; // Proposer auto-approves
    transaction.created_at = clock.unix_timestamp;
    transaction.deadline = deadline;
    transaction.executed = false;
    transaction.bump = ctx.bumps.transaction;

    msg!("Transaction {} created by {}", transaction_id, proposer);

    Ok(())
}

/// Approve a pending multi-sig transaction
pub fn approve_transaction(ctx: Context<ApproveTransaction>) -> Result<()> {
    let multisig = &ctx.accounts.multisig;
    let transaction = &mut ctx.accounts.transaction;
    let approver = ctx.accounts.approver.key();

    // Verify not already executed
    require!(!transaction.executed, FactoryError::AlreadyExecuted);

    // Verify approver is a signer
    require!(
        multisig.signers.contains(&approver),
        FactoryError::NotASigner
    );

    // Verify not already approved
    require!(
        !transaction.approvers.contains(&approver),
        FactoryError::AlreadyApproved
    );

    // Check deadline if set
    if let Some(deadline) = transaction.deadline {
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= deadline,
            FactoryError::TransactionExpired
        );
    }

    transaction.approvers.push(approver);

    msg!("Transaction {} approved by {} ({}/{})",
        transaction.transaction_id,
        approver,
        transaction.approvers.len(),
        multisig.threshold);

    Ok(())
}

/// Execute a multi-sig transaction after reaching threshold
pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
    let multisig = &ctx.accounts.multisig;
    let transaction = &mut ctx.accounts.transaction;

    // Verify not already executed
    require!(!transaction.executed, FactoryError::AlreadyExecuted);

    // Verify threshold met
    require!(
        transaction.approvers.len() >= multisig.threshold as usize,
        FactoryError::ThresholdNotMet
    );

    // Check deadline if set
    if let Some(deadline) = transaction.deadline {
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= deadline,
            FactoryError::TransactionExpired
        );
    }

    // Mark as executed
    transaction.executed = true;

    // NOTE: Actual execution of the transaction type is handled by
    // specific instruction handlers that verify the transaction is approved
    // and match the expected type. This design keeps the multi-sig logic
    // separate from the business logic.

    msg!("Transaction {} marked for execution", transaction.transaction_id);

    Ok(())
}

/// Cancel a pending multi-sig transaction (only by proposer or if expired)
pub fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
    let transaction = &ctx.accounts.transaction;
    let canceller = ctx.accounts.canceller.key();

    // Verify not already executed
    require!(!transaction.executed, FactoryError::AlreadyExecuted);

    // Can cancel if: original proposer OR transaction expired
    let is_proposer = transaction.approvers.first() == Some(&canceller);
    let is_expired = if let Some(deadline) = transaction.deadline {
        let clock = Clock::get()?;
        clock.unix_timestamp > deadline
    } else {
        false
    };

    require!(
        is_proposer || is_expired,
        FactoryError::CannotCancel
    );

    // Close account (rent goes back to payer)
    msg!("Transaction {} cancelled", transaction.transaction_id);

    Ok(())
}

#[derive(Accounts)]
pub struct InitMultiSig<'info> {
    #[account(
        init,
        payer = payer,
        space = MultiSig::LEN,
        seeds = [MULTISIG_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub multisig: Account<'info, MultiSig>,

    /// The token mint this multi-sig controls
    /// CHECK: Validated by caller
    pub token_mint: UncheckedAccount<'info>,

    /// Initial creator (becomes first signer)
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTransaction<'info> {
    #[account(
        mut,
        seeds = [MULTISIG_SEED, multisig.token_mint.as_ref()],
        bump = multisig.bump
    )]
    pub multisig: Account<'info, MultiSig>,

    #[account(
        init,
        payer = proposer,
        space = MultiSigTransaction::LEN,
        seeds = [
            TRANSACTION_SEED,
            multisig.key().as_ref(),
            multisig.transaction_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub transaction: Account<'info, MultiSigTransaction>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    #[account(
        seeds = [MULTISIG_SEED, multisig.token_mint.as_ref()],
        bump = multisig.bump
    )]
    pub multisig: Account<'info, MultiSig>,

    #[account(
        mut,
        seeds = [
            TRANSACTION_SEED,
            multisig.key().as_ref(),
            transaction.transaction_id.to_le_bytes().as_ref()
        ],
        bump = transaction.bump,
        constraint = transaction.multisig == multisig.key()
    )]
    pub transaction: Account<'info, MultiSigTransaction>,

    pub approver: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account(
        seeds = [MULTISIG_SEED, multisig.token_mint.as_ref()],
        bump = multisig.bump
    )]
    pub multisig: Account<'info, MultiSig>,

    #[account(
        mut,
        seeds = [
            TRANSACTION_SEED,
            multisig.key().as_ref(),
            transaction.transaction_id.to_le_bytes().as_ref()
        ],
        bump = transaction.bump,
        constraint = transaction.multisig == multisig.key()
    )]
    pub transaction: Account<'info, MultiSigTransaction>,

    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelTransaction<'info> {
    #[account(
        seeds = [MULTISIG_SEED, multisig.token_mint.as_ref()],
        bump = multisig.bump
    )]
    pub multisig: Account<'info, MultiSig>,

    #[account(
        mut,
        close = canceller,
        seeds = [
            TRANSACTION_SEED,
            multisig.key().as_ref(),
            transaction.transaction_id.to_le_bytes().as_ref()
        ],
        bump = transaction.bump,
        constraint = transaction.multisig == multisig.key()
    )]
    pub transaction: Account<'info, MultiSigTransaction>,

    #[account(mut)]
    pub canceller: Signer<'info>,
}
