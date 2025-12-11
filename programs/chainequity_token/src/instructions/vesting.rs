use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};
use chainequity_factory::instructions::create_token::TokenConfig;

use crate::state::{VestingSchedule, VestingParams, VestingInterval, TerminationType, VESTING_SEED, VESTING_ESCROW_SEED};
use crate::errors::TokenError;
use crate::events::{VestingScheduleCreated, VestedTokensReleased, VestingTerminated};

#[derive(Accounts)]
#[instruction(params: VestingParams)]
pub struct CreateVestingSchedule<'info> {
    #[account(
        constraint = token_config.features.vesting_enabled @ TokenError::FeatureDisabled,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = VestingSchedule::LEN,
        seeds = [
            VESTING_SEED,
            token_config.key().as_ref(),
            beneficiary.key().as_ref(),
            &params.start_time.to_le_bytes()
        ],
        bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Escrow account to hold vested tokens
    /// CHECK: PDA that will be the authority for the escrow token account
    #[account(
        seeds = [
            VESTING_ESCROW_SEED,
            vesting_schedule.key().as_ref()
        ],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    /// Token account held by escrow authority (created beforehand or via associated token)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Authority's token account to fund the escrow
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Beneficiary wallet
    pub beneficiary: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn create_handler(ctx: Context<CreateVestingSchedule>, params: VestingParams) -> Result<()> {
    require!(params.total_amount > 0, TokenError::InvalidAmount);
    require!(params.total_duration > 0, TokenError::InvalidVestingDuration);

    // Validate that vesting duration (after cliff) is at least one interval
    let vesting_duration = params.total_duration.saturating_sub(params.cliff_duration);
    let interval_seconds = params.interval.to_seconds();
    require!(vesting_duration >= interval_seconds, TokenError::InvalidVestingDuration);

    let clock = Clock::get()?;
    let schedule = &mut ctx.accounts.vesting_schedule;

    schedule.token_config = ctx.accounts.token_config.key();
    schedule.beneficiary = ctx.accounts.beneficiary.key();
    schedule.total_amount = params.total_amount;
    schedule.released_amount = 0;
    schedule.start_time = params.start_time;
    schedule.cliff_duration = params.cliff_duration;
    schedule.total_duration = params.total_duration;
    schedule.interval = params.interval.clone();
    schedule.intervals_released = 0;
    schedule.revocable = params.revocable;
    schedule.revoked = false;
    schedule.termination_type = None;
    schedule.terminated_at = None;
    schedule.terminated_by = None;
    schedule.vested_at_termination = None;
    schedule.termination_notes = None;
    schedule.bump = ctx.bumps.vesting_schedule;

    // Transfer tokens from authority to escrow
    let decimals = ctx.accounts.mint.decimals;
    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.authority_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.escrow_token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        params.total_amount,
        decimals,
    )?;

    // Calculate interval info for event
    let total_intervals = schedule.total_intervals();
    let amount_per_interval = schedule.amount_per_interval();

    emit!(VestingScheduleCreated {
        token_config: ctx.accounts.token_config.key(),
        schedule: schedule.key(),
        beneficiary: ctx.accounts.beneficiary.key(),
        total_amount: params.total_amount,
        start_time: params.start_time,
        cliff_duration: params.cliff_duration,
        total_duration: params.total_duration,
        interval: params.interval,
        total_intervals,
        amount_per_interval,
        created_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Created vesting schedule for {} with {} tokens ({} intervals of {} each)",
        ctx.accounts.beneficiary.key(),
        params.total_amount,
        total_intervals,
        amount_per_interval
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ReleaseVestedTokens<'info> {
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
            VESTING_SEED,
            token_config.key().as_ref(),
            beneficiary.key().as_ref(),
            &vesting_schedule.start_time.to_le_bytes()
        ],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.beneficiary == beneficiary.key() @ TokenError::Unauthorized,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// CHECK: PDA authority for escrow token account
    #[account(
        seeds = [
            VESTING_ESCROW_SEED,
            vesting_schedule.key().as_ref()
        ],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = beneficiary,
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub beneficiary: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn release_handler(ctx: Context<ReleaseVestedTokens>) -> Result<()> {
    let clock = Clock::get()?;

    // Get keys before mutable borrow
    let vesting_schedule_key = ctx.accounts.vesting_schedule.key();
    let escrow_bump = ctx.bumps.escrow_authority;

    let schedule = &mut ctx.accounts.vesting_schedule;

    // Calculate new intervals available
    let new_intervals = calculate_releasable_intervals(schedule, clock.unix_timestamp);
    require!(new_intervals > 0, TokenError::NoTokensToRelease);

    // Calculate amount to release for these intervals
    let total_intervals = schedule.total_intervals();
    let amount_per_interval = schedule.amount_per_interval();
    let remainder = schedule.remainder();

    // Calculate release amount: intervals * amount_per_interval + any remainder shares
    let previous_intervals = schedule.intervals_released;
    let new_total_intervals = previous_intervals + new_intervals;

    // Base release for new intervals
    let mut release_amount = amount_per_interval * new_intervals;

    // Add remainder shares for final intervals
    // Remainder is distributed to the last N intervals where N = remainder
    let remainder_start = total_intervals.saturating_sub(remainder);
    if new_total_intervals > remainder_start && previous_intervals < total_intervals {
        // Calculate how many of the new intervals are in the remainder zone
        let remainder_intervals_before = if previous_intervals > remainder_start {
            previous_intervals - remainder_start
        } else {
            0
        };
        let remainder_intervals_now = if new_total_intervals > remainder_start {
            (new_total_intervals - remainder_start).min(remainder)
        } else {
            0
        };
        release_amount += remainder_intervals_now.saturating_sub(remainder_intervals_before);
    }

    require!(release_amount > 0, TokenError::NoTokensToRelease);

    // Update schedule state
    schedule.intervals_released = new_total_intervals;
    schedule.released_amount = schedule.released_amount
        .checked_add(release_amount)
        .ok_or(TokenError::MathOverflow)?;

    // Transfer tokens from escrow to beneficiary with PDA signing
    let escrow_seeds: &[&[u8]] = &[
        VESTING_ESCROW_SEED,
        vesting_schedule_key.as_ref(),
        &[escrow_bump],
    ];
    let signer_seeds = &[escrow_seeds];

    let decimals = ctx.accounts.mint.decimals;
    token_2022::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.beneficiary_token_account.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            },
            signer_seeds,
        ),
        release_amount,
        decimals,
    )?;

    emit!(VestedTokensReleased {
        token_config: ctx.accounts.token_config.key(),
        schedule: schedule.key(),
        beneficiary: ctx.accounts.beneficiary.key(),
        amount_released: release_amount,
        total_released: schedule.released_amount,
        intervals_released: new_intervals,
        total_intervals_released: schedule.intervals_released,
        slot: clock.slot,
    });

    msg!("Released {} vested tokens ({} intervals) to {}",
        release_amount,
        new_intervals,
        ctx.accounts.beneficiary.key()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct TerminateVesting<'info> {
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        constraint = mint.key() == token_config.mint @ TokenError::Unauthorized,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [
            VESTING_SEED,
            token_config.key().as_ref(),
            vesting_schedule.beneficiary.as_ref(),
            &vesting_schedule.start_time.to_le_bytes()
        ],
        bump = vesting_schedule.bump,
        constraint = !vesting_schedule.revoked @ TokenError::AlreadyTerminated,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// CHECK: PDA authority for escrow token account
    #[account(
        seeds = [
            VESTING_ESCROW_SEED,
            vesting_schedule.key().as_ref()
        ],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Treasury token account to receive forfeited tokens
    #[account(
        mut,
        token::mint = mint,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn terminate_handler(
    ctx: Context<TerminateVesting>,
    termination_type: TerminationType,
    notes: Option<String>,
) -> Result<()> {
    if let Some(ref n) = notes {
        require!(n.len() <= 200, TokenError::TerminationNotesTooLong);
    }

    let clock = Clock::get()?;

    // Get keys before mutable borrow
    let vesting_schedule_key = ctx.accounts.vesting_schedule.key();
    let escrow_bump = ctx.bumps.escrow_authority;

    let schedule = &mut ctx.accounts.vesting_schedule;

    // Calculate vested at current time
    let vested_now = calculate_vested_amount(schedule, clock.unix_timestamp);

    // Determine final vested based on termination type
    let final_vested = match termination_type {
        TerminationType::Standard => vested_now,
        TerminationType::ForCause => 0,
        TerminationType::Accelerated => schedule.total_amount,
    };

    // Calculate amounts
    let already_released = schedule.released_amount;
    let remaining_in_escrow = schedule.total_amount.saturating_sub(already_released);
    let still_owed_to_beneficiary = final_vested.saturating_sub(already_released);
    let to_return = remaining_in_escrow.saturating_sub(still_owed_to_beneficiary);

    // Update schedule state
    schedule.revoked = true;
    schedule.termination_type = Some(termination_type.clone());
    schedule.terminated_at = Some(clock.unix_timestamp);
    schedule.terminated_by = Some(ctx.accounts.authority.key());
    schedule.vested_at_termination = Some(final_vested);
    schedule.termination_notes = notes;

    // Transfer unvested tokens back to treasury
    if to_return > 0 {
        let escrow_seeds: &[&[u8]] = &[
            VESTING_ESCROW_SEED,
            vesting_schedule_key.as_ref(),
            &[escrow_bump],
        ];
        let signer_seeds = &[escrow_seeds];

        let decimals = ctx.accounts.mint.decimals;
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_authority.to_account_info(),
                },
                signer_seeds,
            ),
            to_return,
            decimals,
        )?;
    }

    emit!(VestingTerminated {
        token_config: ctx.accounts.token_config.key(),
        schedule: schedule.key(),
        beneficiary: schedule.beneficiary,
        termination_type,
        final_vested,
        returned_to_treasury: to_return,
        terminated_at: clock.unix_timestamp,
        terminated_by: ctx.accounts.authority.key(),
        slot: clock.slot,
    });

    msg!("Terminated vesting schedule. Final vested: {}, Returned to treasury: {}",
        final_vested, to_return
    );

    Ok(())
}

/// Calculate vested amount at a given timestamp using discrete intervals
///
/// All vesting uses discrete intervals (minute/hour/day/month).
/// Each interval releases the same amount: total_amount / total_intervals.
/// Any remainder is distributed to the final intervals.
pub fn calculate_vested_amount(schedule: &VestingSchedule, current_time: i64) -> u64 {
    // If terminated, use the frozen vested amount
    if let Some(vested_at_term) = schedule.vested_at_termination {
        return vested_at_term;
    }

    // If revoked entirely, nothing further vests
    if schedule.revoked {
        return schedule.released_amount;
    }

    let elapsed = current_time - schedule.start_time;

    if elapsed < 0 {
        return 0;
    }

    // If past total duration, return full amount
    if elapsed >= schedule.total_duration as i64 {
        return schedule.total_amount;
    }

    // During cliff period, nothing vests
    if elapsed < schedule.cliff_duration as i64 {
        return 0;
    }

    // Calculate intervals elapsed after cliff
    let time_after_cliff = (elapsed - schedule.cliff_duration as i64) as u64;
    let interval_seconds = schedule.interval.to_seconds();
    let intervals_elapsed = time_after_cliff / interval_seconds;

    // Get interval calculations
    let total_intervals = schedule.total_intervals();
    let amount_per_interval = schedule.amount_per_interval();
    let remainder = schedule.remainder();

    if total_intervals == 0 {
        return schedule.total_amount;
    }

    // Base vested amount
    let mut vested = amount_per_interval * intervals_elapsed;

    // Distribute remainder to final intervals
    // If remainder is N, the last N intervals each get +1
    if intervals_elapsed > (total_intervals - remainder) {
        let extra_intervals = intervals_elapsed - (total_intervals - remainder);
        vested += extra_intervals;
    }

    // Cap at total amount
    vested.min(schedule.total_amount)
}

/// Calculate how many NEW intervals are available to release
pub fn calculate_releasable_intervals(schedule: &VestingSchedule, current_time: i64) -> u64 {
    let elapsed = current_time - schedule.start_time;

    if elapsed < 0 || elapsed < schedule.cliff_duration as i64 {
        return 0;
    }

    // If past total duration, all intervals should be released
    if elapsed >= schedule.total_duration as i64 {
        return schedule.total_intervals().saturating_sub(schedule.intervals_released);
    }

    // Calculate intervals elapsed after cliff
    let time_after_cliff = (elapsed - schedule.cliff_duration as i64) as u64;
    let interval_seconds = schedule.interval.to_seconds();
    let intervals_elapsed = time_after_cliff / interval_seconds;

    // Return new intervals (not yet released)
    intervals_elapsed.saturating_sub(schedule.intervals_released)
}
