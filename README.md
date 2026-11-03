# EraX Digital

Connect. Create. Own.

Phase 3 adds EraX Social: posts, follows, communities, messages, notifications, and search. Wallet connection, chain indexing, and payments are still absent. The indexer process reports that no chain is connected. Direct messages refresh over HTTP. They are not end-to-end encrypted.

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

The seed refuses to run when `NODE_ENV=production`. It is a development fixture, not a production user.

## Email

`EMAIL_MODE=outbox` stores verification and reset messages locally. The API response says they were not delivered. `EMAIL_MODE=smtp` uses `SMTP_HOST`. Docker Compose includes Mailpit on SMTP port 1025 and a web view on port 8025. Production must use SMTP. The outbox is rejected when `NODE_ENV=production`.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` applies migrations to embedded PGlite. If `DATABASE_URL` points at PostgreSQL, the suite also applies them there.

## Security notes for this phase

- Passwords are hashed with Argon2id. Sessions are random tokens stored as SHA-256 hashes in HttpOnly cookies.
- Mutating API calls require an allowed `Origin`. Session mutations also require the CSRF header.
- Wallet signature login returns HTTP 501. Submitting a private key is rejected and nothing is stored.
- The development outbox can be read without authentication. Keep it on localhost and do not enable it in production.
- No wallet private key, seed phrase, or recovery phrase is accepted or stored.
