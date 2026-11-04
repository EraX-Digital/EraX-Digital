# Solana creator registry

The `creator_registry` program lets a Solana wallet open one creator account. The account is a PDA. Only that wallet can change it.

Program id: `CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1`

This id is the public key of the local program keypair. The program is not deployed.

## PDA

```text
seeds = ["creator", authority_pubkey]
program = creator_registry
```

`CreatorAccount::SEED` is the byte string `creator`. `Pubkey::find_program_address` supplies the bump. The same seeds are checked on `register`, `update_metadata`, and `update_payout`.

## Account

| Field | Type | Meaning |
| --- | --- | --- |
| authority | Pubkey | The wallet that registered |
| payout | Pubkey | Where SOL tips are sent. Defaults to the authority. |
| metadata_uri | String | `https://` or `ipfs://`, at most 2048 bytes |
| registered_at | i64 | Clock unix timestamp at registration |
| updated_at | i64 | Clock unix timestamp of the last change |
| bump | u8 | PDA bump |

`CreatorAccount::SPACE` is `8 + 32 + 32 + 4 + 2048 + 8 + 8 + 1`. The 8-byte head is the Anchor account discriminator. The string is allocated at its maximum so a later metadata update does not grow the account. The URI itself is stored at its real length.

The account does not close. No product rule needs the rent returned.

## Instructions

`register(metadata_uri, payout)`

- Signer: `authority`, who also pays the rent.
- Creates the PDA. A second registration for the same authority fails because the account already exists.
- `payout` is an Anchor `Option<Pubkey>`. `None` stores the authority. `Some` stores that address.
- The zero pubkey is rejected.

`update_metadata(metadata_uri)`

- Signer must be the stored authority.
- The PDA seeds must match that authority and the stored bump.
- `has_one = authority` rejects a substituted account.

`update_payout(payout)`

- Same signer and PDA checks.
- The zero pubkey is rejected.

## Metadata

A URI is accepted only when all of these hold:

- It is not empty and its byte length is at most 2048.
- It starts with `https://` or `ipfs://`.
- Every byte is greater than `0x20` and is not `0x7f`. Spaces, newlines, and other control bytes are rejected.

The chain stores the URI, not the JSON document it points at.

## Events

- `CreatorRegistered { authority, payout, metadata_uri }`
- `CreatorMetadataUpdated { authority, metadata_uri }`
- `CreatorPayoutUpdated { authority, previous_payout, payout }`

Anchor writes each event as a base64 `Program data:` log. The indexer decoder recognizes those names.

## Application use

`buildCreatorRegisterInstruction` and `buildCreatorUpdateMetadataInstruction` in `@erax/wallet-solana/creator-programs` build the same accounts and Anchor discriminators. `/wallet/creator` submits them through the connected wallet when the public program id env vars are set. They are empty, so the page does not send a registration.
