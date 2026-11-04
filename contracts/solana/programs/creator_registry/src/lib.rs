use anchor_lang::prelude::*;

declare_id!("CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1");

pub const MAX_URI_LENGTH: usize = 2048;

#[program]
pub mod creator_registry {
    use super::*;

    pub fn register(ctx: Context<Register>, metadata_uri: String, payout: Option<Pubkey>) -> Result<()> {
        validate_metadata_uri(&metadata_uri)?;
        let payout = payout.unwrap_or(ctx.accounts.authority.key());
        require!(payout != Pubkey::default(), RegistryError::ZeroPayout);
        let now = Clock::get()?.unix_timestamp;
        let creator = &mut ctx.accounts.creator;
        creator.authority = ctx.accounts.authority.key();
        creator.payout = payout;
        creator.metadata_uri = metadata_uri.clone();
        creator.registered_at = now;
        creator.updated_at = now;
        creator.bump = ctx.bumps.creator;
        emit!(CreatorRegistered {
            authority: creator.authority,
            payout,
            metadata_uri,
        });
        Ok(())
    }

    pub fn update_metadata(ctx: Context<UpdateMetadata>, metadata_uri: String) -> Result<()> {
        validate_metadata_uri(&metadata_uri)?;
        let creator = &mut ctx.accounts.creator;
        creator.metadata_uri = metadata_uri.clone();
        creator.updated_at = Clock::get()?.unix_timestamp;
        emit!(CreatorMetadataUpdated {
            authority: creator.authority,
            metadata_uri,
        });
        Ok(())
    }

    pub fn update_payout(ctx: Context<UpdatePayout>, payout: Pubkey) -> Result<()> {
        require!(payout != Pubkey::default(), RegistryError::ZeroPayout);
        let creator = &mut ctx.accounts.creator;
        let previous_payout = creator.payout;
        creator.payout = payout;
        creator.updated_at = Clock::get()?.unix_timestamp;
        emit!(CreatorPayoutUpdated {
            authority: creator.authority,
            previous_payout,
            payout,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = CreatorAccount::SPACE,
        seeds = [CreatorAccount::SEED, authority.key().as_ref()],
        bump
    )]
    pub creator: Account<'info, CreatorAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMetadata<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CreatorAccount::SEED, authority.key().as_ref()],
        bump = creator.bump,
        has_one = authority
    )]
    pub creator: Account<'info, CreatorAccount>,
}

#[derive(Accounts)]
pub struct UpdatePayout<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CreatorAccount::SEED, authority.key().as_ref()],
        bump = creator.bump,
        has_one = authority
    )]
    pub creator: Account<'info, CreatorAccount>,
}

#[account]
pub struct CreatorAccount {
    pub authority: Pubkey,
    pub payout: Pubkey,
    pub metadata_uri: String,
    pub registered_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl CreatorAccount {
    pub const SEED: &'static [u8] = b"creator";
    pub const SPACE: usize = 8 + 32 + 32 + 4 + MAX_URI_LENGTH + 8 + 8 + 1;
}

#[event]
pub struct CreatorRegistered {
    pub authority: Pubkey,
    pub payout: Pubkey,
    pub metadata_uri: String,
}

#[event]
pub struct CreatorMetadataUpdated {
    pub authority: Pubkey,
    pub metadata_uri: String,
}

#[event]
pub struct CreatorPayoutUpdated {
    pub authority: Pubkey,
    pub previous_payout: Pubkey,
    pub payout: Pubkey,
}

#[error_code]
pub enum RegistryError {
    #[msg("Metadata URI is empty, too long, or not an https or ipfs URI")]
    InvalidMetadata,
    #[msg("Payout address is the zero address")]
    ZeroPayout,
}

pub fn validate_metadata_uri(uri: &str) -> Result<()> {
    let bytes = uri.as_bytes();
    require!(!bytes.is_empty() && bytes.len() <= MAX_URI_LENGTH, RegistryError::InvalidMetadata);
    let https = uri.starts_with("https://");
    let ipfs = uri.starts_with("ipfs://");
    require!(https || ipfs, RegistryError::InvalidMetadata);
    require!(
        bytes.iter().all(|byte| *byte > 0x20 && *byte != 0x7f),
        RegistryError::InvalidMetadata
    );
    Ok(())
}
