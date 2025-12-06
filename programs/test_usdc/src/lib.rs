use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, MintTo};
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("28JkLhzXCQme5fFrAqoWwyJxSNiv71CMQcS5x4xCtqoX");

/// TestUSDC - A mock stablecoin for testing dividend distribution
/// Anyone can mint tokens for testing purposes (Devnet only!)
#[program]
pub mod test_usdc {
    use super::*;

    /// Initialize the TestUSDC mint
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("TestUSDC mint initialized");
        Ok(())
    }

    /// Mint TestUSDC tokens to a wallet (for testing only)
    pub fn mint(ctx: Context<MintTestUsdc>, amount: u64) -> Result<()> {
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[
            b"test_usdc_authority",
            &[bump],
        ];
        let signer_seeds = &[seeds];

        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        msg!("Minted {} TestUSDC to {}", amount, ctx.accounts.recipient.key());

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = mint_authority,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA authority for minting
    #[account(
        seeds = [b"test_usdc_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTestUsdc<'info> {
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA authority for minting
    #[account(
        seeds = [b"test_usdc_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = recipient,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Recipient wallet
    pub recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}
