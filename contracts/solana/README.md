# EraX Solana programs

Anchor workspace for the Solana creator registry and native SOL tipping programs. The programs are not deployed. There is no token, fee, or administrator.

## Layout

- `programs/creator_registry` — one creator PDA per authority wallet.
- `programs/creator_tipping` — forwards SOL to that creator's registered payout.
- `tests/programs.rs` — in-process `solana-program-test` coverage.
- `keypairs/` — program keypairs. This directory is gitignored.
- `deployments/` — network records. Devnet and mainnet-beta signatures are null.

## Program ids

These are the public keys of the local keypairs. They are not deployed addresses.

| Program | Public key |
| --- | --- |
| creator_registry | `CW9G6KwD29Zu6MdEFXfJ4c31zWvispLY5hNovprn2Qv1` |
| creator_tipping | `5Z4UJ9gbtfZc4Ha7c4ibHYsd2V77anFpv7KHnqjf5ANV` |

## PDA

```text
["creator", authority_pubkey] under the creator_registry program id
```

## Checks

From this directory, with Rust and the MSVC linker installed:

```powershell
cargo test --manifest-path Cargo.toml
```

`cargo test` uses Solana's in-process program test runtime. It does not start `solana-test-validator`, does not airdrop, and does not contact devnet or mainnet. On 2026-11-04 that command passed 9 tests and failed 0, with `anchor-lang` 0.31.3, `solana-program-test` 2.3.13, and Rust 1.99.1. The Solana CLI and Anchor CLI were not installed, so this was not an SBF build and not `anchor test`.

If OpenSSL fails to compile because the Cargo target path is very long, set `CARGO_TARGET_DIR` to a short directory and run the command again. Do not point that directory at a home folder that gets committed.

The Solana CLI and Anchor CLI are required for a future `anchor deploy`. Do not deploy without approval. See `docs/SOLANA_DEPLOYMENT_GUIDE.md`.
