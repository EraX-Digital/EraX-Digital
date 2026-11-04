use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use creator_registry::CreatorAccount;

declare_id!("5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV");

#[program]
pub mod creator_tipping {
    use super::*;

    pub fn tip(ctx: Context<Tip>, amount: u64) -> Result<()> {
        require!(amount > 0, TippingError::ZeroAmount);
        let sender = ctx.accounts.sender.key();
        let creator = ctx.accounts.creator.authority;
        let payout = ctx.accounts.payout.key();
        let now = Clock::get()?.unix_timestamp;
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sender.to_account_info(),
                    to: ctx.accounts.payout.to_account_info(),
                },
            ),
            amount,
        )?;
        emit!(TipSent {
            sender,
            creator,
            payout,
            amount,
            timestamp: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Tip<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: The address constraint requires this account to be the payout stored by the registry.
    /// The system transfer credits lamports and does not invoke the account.
    #[account(mut, address = creator.payout @ TippingError::InvalidPayout)]
    pub payout: AccountInfo<'info>,
    #[account(
        seeds = [CreatorAccount::SEED, creator.authority.as_ref()],
        bump = creator.bump,
        seeds::program = creator_registry::ID
    )]
    pub creator: Account<'info, CreatorAccount>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct TipSent {
    pub sender: Pubkey,
    pub creator: Pubkey,
    pub payout: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum TippingError {
    #[msg("Tip amount must be greater than zero")]
    ZeroAmount,
    #[msg("Payout account does not match the registered creator")]
    InvalidPayout,
}
