# EraX Digital — Phase 2 Completion Report

Date: 2026-11-03

Phase 2 is the core platform foundation. It is not a production deployment and it does not include a feed, token, contract, or chain indexer.

## Status

| Area | Status |
| --- | --- |
| pnpm workspace install and toolchain | COMPLETED AND TESTED |
| Fastify API, validation, errors, CORS, headers, rate limit, OpenAPI, shutdown | COMPLETED AND TESTED |
| `GET /health`, `GET /ready`, `GET /api/v1` | COMPLETED AND TESTED |
| Drizzle schema and PGlite migration | COMPLETED AND TESTED |
| PostgreSQL 16 server migration | IMPLEMENTED BUT NOT FULLY TESTED |
| Docker Compose (PostgreSQL, Valkey, Mailpit) | BLOCKED |
| Email registration, Argon2id, sessions, logout, current user | COMPLETED AND TESTED |
| Email verification and password reset through the development outbox | COMPLETED AND TESTED |
| SMTP delivery | IMPLEMENTED BUT NOT FULLY TESTED |
| SIWE and SIWS interfaces | PARTIALLY IMPLEMENTED |
| Web app pages and production build serving on port 3000 | COMPLETED AND TESTED |
| Admin login, role gate, users, audit log | COMPLETED AND TESTED |
| Indexer process | PARTIALLY IMPLEMENTED |
| Filesystem media storage | COMPLETED AND TESTED |
| S3-compatible media storage | NOT IMPLEMENTED |
| Smart contracts, token, chain deployment | NOT IMPLEMENTED |

## Implemented features

- pnpm 10.15.0 workspace, TypeScript 5.9, ESLint, Prettier, Vitest, and Zod environment validation.
- Fastify API with Pino logging, `/api/v1`, Helmet, CORS credentials, cookie sessions, origin checks, CSRF on session mutations, and rate limits. Auth routes use a tighter limit outside tests.
- Argon2id passwords, SHA-256 session and token hashes, email verification, password reset, session rotation on login, and revocation on reset and suspension.
- Development email outbox. Responses report `delivered: false`. The file text says the message was not delivered.
- Admin role checks. A member session is rejected by admin routes and by the admin application.
- Next.js web and admin applications. Empty product areas say they are not available. Counts on the admin dashboard come from the database.
- Indexer `/health` and `/ready` report `indexing.state = not_configured` and `connected: false` for Ethereum, Base, and Solana.
- Wallet routes accept no private key, seed, or recovery phrase. Signature verification is not implemented and returns HTTP 501.

## File paths

Applications and services:

- `apps/web` — landing, register, login, forgot-password, reset-password, verify-email, authenticated home, profile, settings, loading, error, and not-found.
- `apps/admin` — login, dashboard, users, audit log, loading, error, and not-found.
- `services/api` — `src/server.ts`, `src/accounts.ts`, `src/email.ts`, `src/media.ts`, `src/index.ts`.
- `services/indexer` — process that reports no chain connection.

Packages:

- `packages/config` — environment schema, repository-root path resolution.
- `packages/database` — Drizzle schema, SQL migration, PGlite and PostgreSQL clients, seed.
- `packages/auth` — password hashing and token helpers.
- `packages/shared-types` — public account and cookie names.
- `packages/api-client` — browser API client.
- `packages/ui` — shared controls and styles.
- `packages/wallet-core` — integer amount parsing and secret rejection.
- `packages/wallet-evm` — address shape and SIWE status (`implemented: false`).
- `packages/wallet-solana` — address shape and SIWS status (`implemented: false`).
- `packages/blockchain-common` — planned networks and not-configured indexing status.

Infrastructure and docs:

- `docker-compose.yml`
- `infrastructure/docker/api.Dockerfile`, `web.Dockerfile`, `admin.Dockerfile`
- `.github/workflows/ci.yml`
- `.env.example`
- `scripts/write-dev-env.mjs`
- `README.md`

Git is initialized at the repository root. No commit was created.

## Database

Migration: `packages/database/migrations/0001_foundation.sql`

Tables:

- `users`
- `profiles`
- `wallets`
- `auth_challenges`
- `sessions`
- `email_verification_tokens`
- `password_reset_tokens`
- `audit_logs`
- `schema_migrations` (checksum ledger created by the migrator)

Primary keys are UUIDs. Email and username are unique case-insensitively. A wallet is unique per chain family, network, and address. Password hashes are length-checked. `wallets` has no column for a private key, seed, or recovery phrase. Updates set `updated_at` through a trigger. Registration, verification, reset, and suspension run in transactions.

The migration test applies the SQL to in-memory PGlite, checks that the second run is a no-op, and rejects a broken foreign key. `packages/database/src/postgres-migrate.test.ts` runs only when `DATABASE_URL` is set. It was skipped.

This machine's running database is PGlite at `var/pglite`. It contains the development admin fixture and the account created during browser verification.

## API endpoints

System:

- `GET /health`
- `GET /ready` — 503 when a required dependency fails
- `GET /api/v1`
- `GET /docs` when API docs are enabled

Accounts:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/siwe/verify` — 501
- `POST /api/v1/auth/siws/verify` — 501
- `PATCH /api/v1/profile`
- `POST /api/v1/profile/avatar`
- `GET /api/v1/media/*`

Development and admin:

- `GET /api/v1/dev/outbox` — only when the outbox mode is enabled and the process is not production
- `GET /api/v1/admin/summary`
- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users/:id/status`
- `GET /api/v1/admin/audit-logs`

Indexer:

- `GET /health`
- `GET /ready`

Live responses on this machine:

```text
GET /health
{"status":"ok","service":"api"}

GET /ready
{"status":"ready","checks":{"database":{"ok":true,"required":true,"detail":"Database accepted a query"},"valkey":{"ok":false,"required":false,"detail":"Rate limiting is using the in-process store. Valkey is not connected."}}}

GET /api/v1
walletAuth.siwe.implemented false
walletAuth.siws.implemented false
indexing.state not_configured
Ethereum eip155:1 connected false
Base eip155:8453 connected false
Solana solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp connected false
```

The indexer `/ready` body matches that indexing status and reports the process check as ok.

## Tests and builds

This session:

```text
pnpm typecheck
exit 0
packages checked: auth, config, blockchain-common, shared-types, ui, wallet-core, database, api-client, wallet-evm, wallet-solana, indexer, admin, web, api

pnpm lint
exit 0

pnpm test
Test Files  7 passed | 1 skipped (8)
     Tests  18 passed | 1 skipped (19)
  Duration  24.44s
```

Covered by those tests:

- Invalid registration input, missing origin, outbox not marked delivered, login before verification, verification replay, bad password, login, current user, logout.
- Unknown forgot-password address writes no outbox message. Reset rejects the old password and the old session. An expired session is rejected.
- SIWE returns 501 and sets no session cookie. A SIWS body containing a private key returns 400.
- A member receives 403 on admin routes. An admin can list users and suspend another user. Self-suspension returns 400. The audit log records `user.suspended`.
- Profile website update, PNG avatar upload, and media read.
- Readiness returns 503 when injected database and Valkey checks throw. Health stays ok.
- PGlite migration idempotence and foreign-key rejection.
- Production environment rules reject PGlite, memory rate limiting, and the outbox.
- Indexer readiness stays not configured.

Browser pass against the running build:

- Registration of `phase-two@example.com` stored an outbox file and the page exposed the captured message control.
- The verification link marked the account verified. Settings showed `Verification: verified` and `Role: user`.
- Login reached `/app`. The home page says the feed and wallet connection are not available.
- Profile kept the bio and returned to the idle save button with no error alert.
- `http://127.0.0.1:3000/missing-page` rendered the web not-found page.
- Admin root redirected the member session to login. Signing in as that member showed "This account is not an administrator."
- The development admin fixture reached a dashboard with 2 users and 8 audit events. The user table listed `phase_two` and `erax_admin`. The audit table listed registration, verification, login, logout, and `dev.admin_seeded`.
- `http://127.0.0.1:3001/missing-page` rendered the admin not-found page.

`pnpm build` was not run again in this continuation because the web and admin servers are serving the existing production build (`apps/web/.next/BUILD_ID` `Tdz2VZCZK55CtZSzqkeUt`, `apps/admin/.next/BUILD_ID` `tzjXA9w9WfTHaEzamohZf`). Those servers answered the pages above.

The automated browser click on in-app links did not change the URL. Loading the same addresses directly rendered the pages. Forgot-password submission and the admin Suspend button were not clicked in the browser. Password reset and suspension are covered by the API tests.

## Known bugs

No failing test remains in the suite that ran. No product defect was confirmed in the browser pass. The unclicked browser paths are coverage gaps, not observed failures.

## Missing production integrations

- Docker is not installed, so PostgreSQL, Valkey, and Mailpit were not started.
- SMTP is implemented and untested here. Mailpit was not started.
- The real PostgreSQL migration test did not run.
- Valkey is not connected. The in-process limiter is per process.
- S3-compatible media storage has no adapter yet. Development uses `var/media`.
- SIWE and SIWS verification, nonce issuance, and replay protection are not implemented.
- No chain RPC, indexer cursor, contract, or token exists.

## Security limitations

- Session cookies are HttpOnly and SameSite=Lax. `COOKIE_SECURE` is off for this HTTP localhost setup. Production validation requires it on.
- Mutating `/api` calls must come from an allowed origin. Session mutations also require `x-erax-csrf`.
- The development outbox can be read without authentication. Production rejects that mode.
- The development seed creates `admin@example.com` only when `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` are set, and it refuses `NODE_ENV=production`. The password is a local fixture, documented in `README.md`.
- Password reset and admin suspension revoke sessions. Wallet authentication cannot succeed.
- No private key, seed phrase, or recovery phrase is stored. A body that contains one is rejected.

## Commands to run locally

With Docker:

```powershell
node scripts/write-dev-env.mjs
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Without Docker, which is the path used on this machine:

```powershell
node scripts/write-dev-env.mjs --lite
pnpm install
pnpm dev
```

Optional development administrator:

```powershell
$env:DEV_ADMIN_EMAIL="admin@example.com"
$env:DEV_ADMIN_PASSWORD="replace-this-password-1"
pnpm db:seed
```

Checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Addresses:

- Web: http://127.0.0.1:3000
- Admin: http://127.0.0.1:3001
- API: http://127.0.0.1:4000
- API docs: http://127.0.0.1:4000/docs
- Indexer: http://127.0.0.1:4001/ready

Verification and reset links in `--lite` mode are files under `var/outbox`. They are not email.

Phase 3 has not been started.
