# Phase 6 completion report

Date: 2026-11-04

Phase 6 adds the Solana creator registry and native SOL tipping programs, plus the instruction builders, indexer storage, and wallet page that can call them after a real deployment. Nothing was deployed. Phase 7 was not started.

## Toolchain

| Tool | Version | Used |
| --- | --- | --- |
| rustc | 1.99.1 (`58cf8f9c3`, 2026-10-13) | Yes |
| cargo | 1.99.1 (`5f94df478`, 2026-08-27) | Yes |
| anchor-lang crate | 0.31.3 | Yes |
| solana-program-test | 2.3.13 | Yes |
| solana-sdk | 2.3.1 | Yes |
| Anchor CLI | Not installed | No |
| Solana CLI | Not installed | No |

`cargo test` compiles the programs for the host and runs them inside `solana-program-test`. That is not an SBF build and not `anchor test`.

## Program architecture

`contracts/solana` is the Anchor workspace.

| Program | Public key | Role |
| --- | --- | --- |
| creator_registry | `CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1` | One creator PDA per authority |
| creator_tipping | `5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV` | System transfer of the exact lamport amount to the stored payout |

These public keys belong to local keypairs in `contracts/solana/keypairs/`. That directory is gitignored. A clone without the keypairs cannot deploy these ids. The deployment JSON files record the public keys and set every transaction signature to null.

## PDA

```text
seeds = ["creator", authority_pubkey]
program = creator_registry
```

`Pubkey::find_program_address` supplies the bump. Register, update, and tip all check those seeds. Tipping also sets `seeds::program` to the registry program id.

## Account

`CreatorAccount` fields: `authority`, `payout`, `metadata_uri`, `registered_at`, `updated_at`, `bump`.

Space is `8 + 32 + 32 + 4 + 2048 + 8 + 8 + 1`. The URI must be `https://` or `ipfs://`, at most 2048 bytes, with no whitespace or control bytes. There is no close instruction.

## Instructions and events

Registry:

- `register(metadata_uri, payout)` creates the PDA. `None` stores the authority as the payout.
- `update_metadata(metadata_uri)` requires the authority signature and the PDA seeds.
- `update_payout(payout)` has the same signer checks and rejects the zero pubkey.

Tipping:

- `tip(amount)` requires `amount > 0`, the registry PDA, and `payout == creator.payout`.
- The only CPI is `system_program::transfer` of that exact amount.
- There is no fee, vault, token, or admin withdrawal.

Events: `CreatorRegistered`, `CreatorMetadataUpdated`, `CreatorPayoutUpdated`, `TipSent { sender, creator, payout, amount, timestamp }`.

On a deployed program, Anchor writes these as `Program data:` logs. In this in-process test runtime, `sol_log_data` is printed by the host stub and is not copied into `log_messages` as `Program data:`. The test records those bytes and checks the sender, payout, and amount.

## Tests that ran

Command, from the repository root, after the OpenSSL build had already succeeded in `C:\eraxst`:

```powershell
$env:CARGO_TARGET_DIR = 'C:\eraxst'
cargo test --manifest-path contracts/solana/Cargo.toml --test programs -- --test-threads=8
```

Result, exit 0:

```text
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.84s
```

The nine tests cover registration and duplicate rejection, PDA ownership, metadata update, invalid metadata, zero payout, two independent creators, substituted creator accounts, a fake registry-owned account that is not the PDA, exact payout increases of 250_000 and 100_000 lamports, zero and unregistered and wrong-payout tips, payout changes, and `TipSent` contents for 80_000 lamports.

An earlier `cargo test` failed before these results. The first failure was OpenSSL's `nmake` under a very long Cargo target path. The second was the test crate using `Account` where `solana-program-test` 2.3 expects `AccountSharedData`, plus Anchor's `entry` lifetime not matching the test builtin. Those are fixed in `contracts/solana/tests`. The passing run above is the one to cite.

TypeScript, exit 0:

```powershell
pnpm exec vitest run packages/wallet-solana/src/creator-programs.test.ts services/indexer/src/solana-events.test.ts packages/database/src/migrate.test.ts
```

```text
Test Files  3 passed (3)
     Tests  9 passed (9)
```

That covers PDA stability, register and metadata-update discriminators, zero-tip rejection, `TipSent` log decoding, creator-account decoding, one-row deduplication, a restarted indexer checkpoint, and skipping a failed signature.

`pnpm --filter @erax/wallet-solana --filter @erax/database --filter @erax/indexer --filter @erax/web typecheck` exited 0.

## Security measures

- PDA seeds and bump are constraints, not caller-chosen addresses.
- Updates require the authority signer and `has_one = authority`.
- Tips cannot name an arbitrary recipient.
- A substitute account owned by the registry still fails the seed check.
- Zero amounts and the zero pubkey are rejected.
- No close instruction, fee account, or admin signer.
- Keypairs are gitignored. `NEXT_PUBLIC_` variables are for public program ids only.
- This is not an independent audit.

## Indexer

Migration `0004_solana_programs.sql` adds `chain_program_events`. The unique key is `(network, signature, event_index)`. `storeSolanaCreatorEvents` uses `onConflictDoNothing`.

`runSolanaIndexerTick` still stores the chain head on the first tick and indexes nothing. Later ticks read the latest 20 finalized signatures of verified, connected Solana wallets. Failed signatures are skipped and are not stored. Successful signatures can store a system transfer and any decoded creator events. There is no historical backfill. A tip is missed when neither the sender nor the payout is a watched wallet, which happens if the creator changed the payout away from the linked authority.

## Frontend and API

`/wallet/creator` is linked from the wallet frame. With the program id env vars empty, the page says the programs are not deployed and does not show the form. That is what the browser showed at `http://127.0.0.1:3000/wallet/creator`.

When both public ids are set, the page can register, update metadata, and tip. The tip reads the creator PDA and uses the stored payout. The connected wallet must approve. The page does not ask for a seed phrase.

`/wallet/send` still rendered the existing transfer form and the wallet-approval notice. The home page still said accounts work without a wallet. No browser extension completed a signature in this session.

Received SOL tips are not listed on a profile. The indexer stores them, and no API reads `chain_program_events` for display. A partial sum would look like a complete history, so the page does not show one.

The EVM contracts were not edited. Ethereum and Base still have no deployed creator contracts and no contract page.

## Deployment status

| Network | Status |
| --- | --- |
| In-process program test | 9 tests passed |
| solana-test-validator | Not run. The Solana CLI is not installed |
| Devnet | `not_deployed`, signature null |
| Mainnet-beta | `not_deployed`, signature null. The deploy script always exits 1 |

`deploy-devnet.ps1` also exits 1. It does not broadcast even if `ERAX_APPROVE_SOLANA_DEPLOY=devnet`.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| Both programs compile | Met, as host code inside `cargo test` |
| Registry tests pass | Met. 9 passed, 0 failed, 0 ignored |
| Tipping tests pass | Met, in the same run |
| Security tests pass | Met, in the same run |
| PDA documented and tested | Met |
| Registration on a local validator | Not met as a validator process. Met inside `solana-program-test` |
| Metadata updates | Met inside `solana-program-test` |
| SOL tipping on a local validator | Not met as a validator process. Met inside `solana-program-test` |
| Recipient receives the exact amount | Met in the program test |
| Unauthorized operations rejected | Met in the program test |
| Event emission | Met for the host `sol_log_data` bytes. `log_messages` did not contain `Program data:` in this harness |
| Indexer decoding | Met for crafted logs in the Vitest |
| Database dedup | Met on PGlite |
| EVM contracts unchanged | Met |
| Ethereum and Base wallets | The send page still rendered. No extension transaction was signed |
| Social features | The landing page still rendered. This pass did not re-run the social suite |
| Docs match the implementation | Met by this report |

## Remaining limitations

- No SBF artifact, no `solana-test-validator`, no devnet, no mainnet-beta.
- No independent audit.
- The indexer is not a full program history.
- The creator page does not show received tips.
- A fresh clone cannot deploy the recorded program ids without the gitignored keypairs.
- Do not start Phase 7 until this phase is approved.

## Local commands

```powershell
cargo test --manifest-path contracts/solana/Cargo.toml --test programs -- --test-threads=8
pnpm exec vitest run packages/wallet-solana/src/creator-programs.test.ts services/indexer/src/solana-events.test.ts packages/database/src/migrate.test.ts
pnpm --filter @erax/wallet-solana --filter @erax/database --filter @erax/indexer --filter @erax/web typecheck
```

If OpenSSL's Windows build fails, set `CARGO_TARGET_DIR` to a short path and run the Cargo command again. The passing run used `C:\eraxst`.
