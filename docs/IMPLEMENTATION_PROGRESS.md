# EraX Digital — Implementation Progress

Last updated: 2026-11-04

## Current status

Phase 5, EVM smart contract infrastructure, is implemented and tested locally. Phase 6, the Solana creator registry and tipping programs, is implemented and tested in-process. Neither phase is deployed. Both are waiting for approval.

The SocialFi demo dataset is in the local PGlite database: 25 fictional profiles, 120 original posts, and the related comments, likes, reposts, bookmarks, follows, communities, and polls. Production was not seeded. See `docs/SOCIALFI_DATABASE_COMPLETION_REPORT.md`.

`CreatorRegistry` and `CreatorTipping` compile with Solidity 0.8.30. Foundry tests passed on the in-process EVM. No deployment script was broadcast. No testnet or mainnet transaction was sent. The deployment records in `contracts/evm/deployments/` keep every address and transaction hash as `null`. The contracts are not audited.

The web app does not call the EVM contracts. `packages/wallet-evm` can encode `register`, `updateMetadata`, and `tip` once a real address is supplied. The indexer still does not decode an EVM `TipSent` log. It does decode Solana `Program data:` logs into `chain_program_events` when a verified linked wallet's recent signatures contain them.

Phase 4 remains in place: SIWE, wallet connection, balance reads, and wallet-signed transfers. A browser extension approval is still blocked on this machine. PostgreSQL still does not start under this Administrator account. Wallet migration `0003_wallet.sql` was applied and checked on PGlite. The PostgreSQL `DATABASE_URL` test remains skipped.

## Completed tasks

Phase 1, Phase 2, and Phase 3 remain. Phase 4 added:

- Typed networks for Ethereum, Base, Sepolia, Base Sepolia, Solana mainnet-beta, and Solana devnet.
- Wagmi 3 and Viem wallet connection in the browser, plus Phantom, Solflare, and Backpack through Wallet Adapter on `@solana/web3.js` 1.99.0.
- SIWE and SIWS challenge, one-time nonce, signature check, and EraX session.
- Multiple linked wallets, a preferred wallet, and disconnect that keeps the address reserved.
- Native and token balance reads, transfer previews, wallet-signed submission, and receipt checks.
- A forward indexer with checkpoints, a 25-block EVM window, and reorg rewind.
- Wallet pages under `/wallet`.

Phase 5 added `contracts/evm`: `CreatorRegistry`, `CreatorTipping`, Foundry tests, Sepolia and Base Sepolia scripts, and unsigned call builders in `packages/wallet-evm`. No broadcast.

Phase 6 added `contracts/solana`: `creator_registry`, `creator_tipping`, in-process program tests, instruction builders, indexer event storage, and `/wallet/creator`. No devnet or mainnet-beta broadcast. The page stays inactive until the public program ids are set.

The SocialFi upgrade added migration `0005_socialfi.sql` (quote posts, community rules, content reports, demo marks), profile tabs, paginated feeds, and an explicit not-enabled state for on-chain creator registration and tips. Demo content is opt-in. There is still no EraX token.

## Remaining tasks

- Approval before any Sepolia or Base Sepolia broadcast.
- An independent review before any mainnet use. Passing Foundry tests are not that review.
- A database URL on the Vercel project before public account creation can persist. That is separate from these contracts.
- A passing `pnpm db:verify` against real PostgreSQL, then Neon, before any production migration.
- Live SMTP, S3, and Valkey, unchanged from the production checklist.
- A browser extension approval for MetaMask, Coinbase Wallet, Phantom, Solflare, or Backpack.
- EIP-1271 against a contract wallet.
- An ownership-transfer flow if a linked address should move between accounts.
- Do not add an EraX token. Do not deploy the Solana programs. Do not start Phase 7.

## Current architecture

The API remains a long-running Fastify process. Web and admin remain Next.js apps. The indexer is a second long-running process. It scans only when its database and at least one RPC URL are available. On PGlite it must use the same directory as the API, and it cannot open that directory while the API holds the file.

`docs/PHASE_4_ARCHITECTURE.md` is the wallet design. `docs/PHASE_5_ARCHITECTURE.md` is the EVM contract design. `docs/PHASE_6_ARCHITECTURE.md` is the Solana program design. The completion reports record what was actually tested.

`pnpm lint` exited 0 after the final connect-page edit. `pnpm --filter @erax/web build` and `pnpm --filter @erax/admin build` exited 0.

## Known issues

- This Windows session runs as Administrator. PostgreSQL 16.15 still exits before accepting connections.
- Docker is not installed.
- Email, object storage, and Valkey were not connected to live services.
- Portfolio valuation is unavailable because no price feed is configured.
- Wallet history is not exhaustive. The first indexer tick stores the chain head and does not backfill.
- Solana history sync stores recent finalized system transfers. It also stores creator-program events from those same recent signatures. The first tick still stores the head and does not backfill.
- `@solana/wallet-adapter-backpack@0.1.14` is deprecated upstream and is still the installed adapter.
- Without the MetaMask extension, the MetaMask button entered `Connecting` and did not return an error in this browser.

## Test results

```text
Test Files  22 passed | 1 skipped (23)
     Tests  56 passed | 1 skipped (57)
  Duration  75.84s
```

`pnpm typecheck` and `pnpm lint` exited 0 before the final connector-peer install. The web production build was run again after that install. See `docs/PHASE_4_COMPLETION_REPORT.md` for the command results.

The skipped test is `packages/database/src/postgres-migrate.test.ts`.

SocialFi upgrade, after migration `0005_socialfi` and the new API and seed tests:

```text
pnpm test
Test Files  27 passed | 1 skipped (28)
     Tests  77 passed | 1 skipped (78)
  Duration  about 137s
```

The same PostgreSQL migration test is the skip. `pnpm --filter @erax/database exec tsc --noEmit` and `pnpm --filter @erax/api exec tsc --noEmit` exited 0. Lint of the SocialFi files exited 0. Two later UI fixes, UTC timestamps and a Profile link in the mobile bar, came after that suite run. Production was not seeded or deployed.

## Contract tests

```text
forge build
Compiler run successful
Solc 0.8.30

forge test --summary
CreatorRegistryTest     14 passed
CreatorTippingTest      11 passed
RegistryInvariantTest    1 passed (2 invariants, 64 runs, 1280 calls)
TippingInvariantTest     1 passed (64 runs, 1280 calls)
27 passed, 0 failed, 0 skipped

forge fmt --check
exit 0
```

`packages/wallet-evm` creator-call tests: 4 passed. The existing SIWE and transfer tests in that package also passed in the same run (10 tests across 3 files).

## Next exact implementation step

Wait for approval. Do not broadcast a deployment, send mainnet funds, or start Phase 7. Phase 6 details are in `docs/PHASE_6_COMPLETION_REPORT.md`.
