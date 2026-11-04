# EraX Digital

Connect. Create. Own.

Phase 3 adds EraX Social: posts, follows, communities, messages, notifications, and search. Phase 4 adds Ethereum, Base, and Solana wallet connection, balances, send and receive, and a forward chain indexer. Direct messages refresh over HTTP. They are not end-to-end encrypted. There is no EraX token and no dollar portfolio price.

## Local setup

Requirements: Node.js 22 or newer, pnpm 10.15.0. Docker is the intended way to run PostgreSQL 16 and Valkey. This repository can also run the API on embedded PGlite when Docker is not installed. PGlite is for development and tests. Production configuration rejects it.

```powershell
node scripts/write-dev-env.mjs
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Without Docker:

```powershell
node scripts/write-dev-env.mjs --lite
pnpm install
pnpm dev
```

`--lite` selects PGlite and the in-process rate limiter. Readiness then reports Valkey as not connected. Email mode remains `outbox`: messages are written to `var/outbox` and are not sent.

Apps:

- Web: http://127.0.0.1:3000
- Admin: http://127.0.0.1:3001
- API: http://127.0.0.1:4000
- API docs: http://127.0.0.1:4000/docs
- Indexer: http://127.0.0.1:4001/ready

Create an administrator only when you intend to use the admin app:

```powershell
$env:DEV_ADMIN_EMAIL="admin@example.com"
$env:DEV_ADMIN_PASSWORD="replace-this-password-1"
pnpm db:seed
```

The seed refuses to run when `NODE_ENV=production` and when the database host is not local. It creates one development administrator. It does not create posts, messages, communities, or statistics.

## Email

`EMAIL_MODE=outbox` stores verification and reset messages locally. The API response says they were not delivered. `EMAIL_MODE=smtp` uses `SMTP_HOST`. Docker Compose includes Mailpit on SMTP port 1025 and a web view on port 8025. Production must use SMTP. The outbox is rejected when `NODE_ENV=production`.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` applies migrations to embedded PGlite. The PostgreSQL server test runs only when `DATABASE_URL` is set. Production deployment is documented separately and is not ready for a public launch.

## Production preparation

The production guides are:

- `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
- `docs/PRODUCTION_DATABASE_GUIDE.md`
- `docs/VERCEL_CONFIGURATION.md`
- `docs/PRODUCTION_ENVIRONMENT_VARIABLES.md`
- `docs/PRODUCTION_READINESS_CHECKLIST.md`

Web and admin are prepared as two Vercel projects. The API and indexer stay on a long-running Node.js host. Production rejects PGlite, local media disk, the email outbox, and the in-process rate limiter. No deployment, DNS change, or production migration has been run.

## Wallets

Wallet pages live at `/wallet`. Email registration does not require a wallet. Sign-in with Ethereum and Sign-in with Solana are additional session paths. One account can link more than one address. The API stores public addresses only.

Server RPC variables are `EVM_RPC_URL_1`, `EVM_RPC_URL_8453`, `EVM_RPC_URL_11155111`, `EVM_RPC_URL_84532`, `SOLANA_RPC_URL_MAINNET`, and `SOLANA_RPC_URL_DEVNET`. Leave them empty in test and production to leave that network unconfigured. Development falls back to keyless public endpoints. Do not put an API key in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET`, or `NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET`.

The guides are `docs/WALLET_INTEGRATION_GUIDE.md`, `docs/EVM_INTEGRATION_GUIDE.md`, `docs/SOLANA_INTEGRATION_GUIDE.md`, `docs/WALLET_SECURITY.md`, and `docs/BLOCKCHAIN_INDEXER_GUIDE.md`.

## Security notes for this phase

- Passwords are hashed with Argon2id. Sessions are random tokens stored as SHA-256 hashes in HttpOnly cookies.
- Mutating API calls require an allowed `Origin`. Session mutations also require the CSRF header.
- Wallet sign-in verifies a SIWE or SIWS signature and consumes the nonce once. A body that contains a private key is rejected and nothing is stored.
- A submitted transaction stays pending until a matching chain receipt or finalized Solana transfer is read.
- The development outbox can be read without authentication. Keep it on localhost and do not enable it in production.
- No wallet private key, seed phrase, or recovery phrase is accepted or stored.
