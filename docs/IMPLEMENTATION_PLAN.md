# EraX Digital — Implementation Plan

Status: Phase 1 complete on 2026-11-03. Phase 2 is the next execution step.

Architecture: `docs/TARGET_ARCHITECTURE.md`.

Licenses: `docs/THIRD_PARTY_LICENSES.md`.

Each phase ends only when its tests pass or the progress file records the exact external blocker. Failing tests are fixed. They are not skipped to produce a green command.

## Phase 2 — Foundation

Goal: a monorepo that installs, typechecks, migrates an empty database, and serves a health check. No social features yet.

1. Initialize Git with a `.gitignore` for `.env`, `node_modules`, Foundry and Anchor build output, keys, and OS files. Do not commit secrets.
2. Add `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, Prettier, and ESLint.
3. Add `packages/configuration` that parses environment variables with Zod and fails startup when a required variable is missing.
4. Add `packages/database` with Drizzle, the first migration for `users`, `profiles`, `sessions`, `email_tokens`, `wallets`, and `wallet_auth_challenges`, and a migration test that applies the SQL against PostgreSQL.
5. Add `packages/shared-types` and `packages/authentication` with password hashing, session creation, and challenge persistence. No HTTP yet.
6. Add `services/api` with Fastify, `/health`, `/ready`, structured logging, and a consistent error handler.
7. Add `apps/web` with Next.js, a home route that renders the product name and tagline, and a documented provisional type scale. No fake data and no dead buttons.
8. Add `docker-compose.yml` for PostgreSQL 16, Valkey, and Mailpit, plus Dockerfiles for the API and web app.
9. Add `.env.example` and a GitHub Actions workflow for install, typecheck, lint, and unit tests.
10. Write `README.md` with the local start commands that actually work.

Exit criteria:

- `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` succeed.
- `docker compose up` brings up PostgreSQL, Valkey, and Mailpit.
- The migration applies to an empty database and a second run is a no-op.
- `/health` returns success.

## Phase 3 — Authentication and profiles

1. Email register, verify, login, logout, password reset, and session expiry.
2. SIWE and SIWS challenge, verify, link, and unlink. Replay a nonce and assert rejection.
3. Rate limits on auth routes through Valkey.
4. Profile read and update, reserved usernames, avatar and cover upload to the local media driver.
5. Web pages: login, register, reset, settings, profile edit. Wire every control to the API.

Exit criteria: API integration tests cover the success and failure paths. A browser pass completes register, verify, login, edit profile, and logout against the local stack.

## Phase 4 — Social application

1. Posts, edits, soft delete, images, video metadata, links, hashtags, mentions.
2. Likes, comments, replies, reposts, bookmarks, follow, unfollow, block.
3. Cursor-paginated home and profile feeds.
4. PostgreSQL full-text search for people, posts, and hashtags.
5. Notifications for follow, like, comment, reply, and mention, plus email preference.
6. Conversations, message history, WebSocket delivery, read receipts. Do not label the channel as end-to-end encrypted.
7. Reports and the admin app: queue, hide, restore, suspend, audit log.
8. Pages: explore, feed, post, profile, messages, notifications, search, settings, security, admin.

Exit criteria: integration tests for each write path, including blocked users and unauthorized edits. Web flows for post, comment, follow, message, and report run against the local API.

## Phase 5 — Wallet

1. RainbowKit for Ethereum and Base. Wallet Adapter for Solana. One wallet page.
2. Live balances from RPC. If the RPC is unset, the page shows that configuration is required.
3. Receive, copy, QR, and send with an explicit confirmation step. Integer amounts only.
4. Indexer process for EraX events and linked-wallet transfers on Ethereum, Base, and Solana.
5. History states: pending, confirmed, failed, reverted, finalized.
6. Tests that do not need a hosted RPC use Anvil and `solana-test-validator`. Hosted testnet tests are marked and skipped with a written reason when credentials are absent.

Exit criteria: local chain tests for connect configuration, message signing verification, a native transfer on Anvil, and a SOL transfer on the local validator. The UI cannot submit without confirmation.

## Phase 6 — Solidity

1. Implement `EraXProfileRegistry`, `EraXCreatorPayments`, and `EraXContentAccess` with OpenZeppelin 5.7.
2. Tests: unit, fuzz, invariant, access control, payment, reentrancy, and rollback.
3. `forge build` and `forge test -vvv`.
4. `blockchain/evm/SECURITY.md` stating the contracts are not audited.
5. Deploy scripts for Anvil and testnets. Mainnet is not a default target.
6. API verification of payment events against these contracts.

Exit criteria: Foundry tests pass. A local subscription payment emits the event the indexer stores.

## Phase 7 — Anchor

1. Implement `erax_identity` and `erax_creator` with PDA and signer checks.
2. Tests for PDA derivation, unauthorized signers, payments, SPL transfer of an allowlisted mint, and failure paths.
3. `anchor build` and `anchor test`.
4. Devnet instructions that refuse mainnet.
5. TypeScript client in `packages/wallet-solana` generated from the IDL.

Exit criteria: Anchor tests pass on a local validator. The API grants a test entitlement only after the program event is observed.

## Phase 8 — Creator product

1. Creator profile and dashboard backed by confirmed payments.
2. Subscribe and tip actions that build chain transactions and wait for indexer confirmation.
3. Paid-content entitlement checks on the server.
4. Revenue views computed from stored confirmed payments. Empty when there are none.

Exit criteria: an end-to-end local test pays a subscription on Anvil and unlocks a piece of content. The same flow exists for the Solana program on a local validator.

## Phase 9 — Hardening and release notes

1. Dependency review and a generated notice list.
2. Threat-model pass on auth, uploads, and withdrawals.
3. Backup and restore steps for PostgreSQL.
4. Testnet deployment guide.
5. `docs/ERAX_FINAL_IMPLEMENTATION_REPORT.md` with one status per feature: completed and tested, implemented but not fully tested, partially implemented, not implemented, or blocked. Each completed feature names its directories and tests, and the report quotes the actual command output.

Production readiness is not declared because the site builds. It is declared only for features whose tests and operational steps exist.

## Explicitly out of scope until a new written decision

- Native EraX token.
- Mainnet deployment.
- Upgradeable proxies.
- Custodial wallets.
- Kafka, Kubernetes, and per-feature microservices.
- Mobile applications.
- End-to-end encrypted messages.
- On-chain follow storage.
- Reown AppKit.
- Copying Hey, Lens, Snapchain, Tribe, or the Farcaster specification into this tree.

## Phase 2 first commands

The next session starts at Phase 2 and does not repeat the audit.

```text
1. git init, .gitignore, pnpm workspace, TypeScript base config.
2. packages/configuration and .env.example.
3. docker-compose.yml for PostgreSQL 16, Valkey, Mailpit.
4. packages/database with the auth migration.
5. services/api health check.
6. apps/web home page.
7. pnpm typecheck, pnpm lint, pnpm test, and a migration apply.
```
