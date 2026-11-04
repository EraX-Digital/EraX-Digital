# Phase 6 architecture

Date: 2026-11-04

Phase 6 adds two Anchor programs, `creator_registry` and `creator_tipping`, plus the TypeScript instruction builders, indexer decoding, and wallet page that call them. It does not add a token, a fee, a custodial balance, or a deployment.

The programs are not deployed. Devnet and mainnet-beta records keep `transactionSignature` null. Local tests run inside `solana-program-test`. They do not start `solana-test-validator`.

## What already existed

Phases 1–5 stay in place.

- Social accounts, profiles, posts, follows, communities, messages, notifications, search, and the admin app are unchanged.
- Solana wallet connection uses `@solana/web3.js` 1.99.0 and Wallet Adapter. The API verifies SIWS and stores the public address only.
- `packages/wallet-solana` already reads balances, prepares system transfers, and asks the connected wallet to sign.
- The indexer already stores recent finalized system transfers for verified linked wallets and keeps a checkpoint per CAIP-2 network.
- Phase 5 `CreatorRegistry` and `CreatorTipping` in `contracts/evm` were not modified.

## Workspace

`contracts/solana` is the Anchor workspace. Rust edition 2021. `anchor-lang` is pinned to 0.31.3. The Solana CLI and the Anchor CLI are not installed on this machine, so the test script is `cargo test`, not `anchor test`.

| Path | Role |
| --- | --- |
| `programs/creator_registry` | One creator PDA per authority |
| `programs/creator_tipping` | Exact SOL transfer to the registered payout |
| `tests/programs.rs` | In-process banks-client tests |
| `keypairs/` | Program keypairs. Gitignored. Not a deployment. |
| `deployments/` | Network records. Every signature is null. |
| `scripts/deploy-devnet.ps1` | Refuses to broadcast |
| `scripts/deploy-mainnet.ps1` | Always exits with an error |

Program ids in `Anchor.toml` are the public keys of the local keypairs:

| Program | Public key |
| --- | --- |
| creator_registry | `CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1` |
| creator_tipping | `5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV` |

A clone without `contracts/solana/keypairs` cannot deploy these ids. Do not invent a replacement id in a deployment record.

## Account model

```text
authority wallet
  -> creator_registry::register
       creates PDA ["creator", authority] owned by creator_registry
  -> creator_tipping::tip
       reads that PDA
       system_program::transfer(sender, creator.payout, amount)
```

The creator account stores the authority, the payout wallet, a metadata URI, two timestamps, and the PDA bump. It does not store posts or private profile fields. There is no close instruction.

The tipping program does not hold lamports. The system transfer credits the payout address stored on the creator account. The sender pays the network fee separately.

## Application integration

`packages/wallet-solana/src/creator-programs.ts` derives the PDA, builds `register`, `update_metadata`, and `tip`, and decodes Anchor `Program data:` logs. The web page `/wallet/creator` uses those builders only when both `NEXT_PUBLIC_SOLANA_CREATOR_*_PROGRAM_ID` values are set. Those variables are empty. The page then says the programs are not deployed and does not submit a transaction.

The connected wallet must approve every transaction. The page does not ask for a seed phrase.

The indexer writes decoded registry and tipping events to `chain_program_events` when a verified linked wallet's recent finalized signatures contain those logs. Migration `0004_solana_programs.sql` creates that table. The first tick on a network still stores the head and indexes nothing. There is no historical backfill. The creator page does not list received tips from that table.

## Explicitly not in this phase

- Devnet or mainnet-beta deployment.
- A running `solana-test-validator` deployment. The local proof is the in-process program test.
- An SBF build. `cargo test` executes the program entrypoints as native code through `processor!`.
- Treating an Ethereum registration and a Solana registration on the same EraX account as one creator.
- An EraX token, a platform fee, staking, or an administrator withdrawal.
