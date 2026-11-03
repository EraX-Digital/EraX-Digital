# EraX Digital — Implementation Progress

Last updated: 2026-11-03

## Current status

Phase 3 remains in place. Production deployment is prepared and is not approved to launch.

No Vercel project was created, no DNS record was changed, and no migration was run against Neon. Do not start Phase 4 from this work.

PostgreSQL compatibility is not established on a running server. `pnpm db:verify:embedded` ran the PostgreSQL 16.15 `initdb` from `embedded-postgres@16.15.0-beta.19` and then failed because PostgreSQL refused to start under the Administrator account. The command exited 1. The test that talks to a supplied `DATABASE_URL` is still skipped locally. The GitHub Actions workflow that provides PostgreSQL 16 was not run.

SMTP, S3, Valkey, and Vercel runtime behavior were not exercised against live services.

## Completed tasks

Phase 1 and Phase 2 remain. Phase 3 added EraX Social. This pass added production configuration and deployment instructions.

Verified in this session:

- `pnpm typecheck` exited 0.
- `pnpm lint` exited 0.
- `pnpm test` — 15 files passed, 1 skipped, 33 tests passed, 1 skipped.
- `pnpm build` in `apps/web` and `apps/admin` exited 0 (`next build`, Next.js 16.4.4).
- `pnpm install --frozen-lockfile --filter @erax/web...` from `apps/web` exited 0.
- `pnpm install --frozen-lockfile --filter @erax/admin...` from `apps/admin` exited 0.
- Production environment parsing rejects PGlite, the memory rate limiter, the email outbox, filesystem media, insecure cookies, and localhost database URLs.
- Remote seed and remote migration guards were unit-tested. They were not aimed at a Neon host.

## Remaining tasks

Before a public launch, an operator has to complete `docs/PRODUCTION_READINESS_CHECKLIST.md`. The blocking evidence gaps are:

- A passing `pnpm db:verify` against real PostgreSQL, then against the Neon preview branch, and only then against production.
- A real SMTP delivery.
- A live S3 upload and download.
- A live Valkey connection used by the rate limiter.
- A Vercel preview of web and admin pointed at a preview API.
- Separate hosting for the Fastify API and the indexer. They are not Vercel functions.

Wallet signature verification and chain indexing remain unimplemented. Do not add a token, contracts, custodial keys, or a chain deployment as part of deployment.

## Current architecture

The API is a long-running Fastify process. Web and admin are Next.js applications prepared as two Vercel projects. The indexer is a second long-running process and still reports that no chain is connected.

Production boot does not migrate unless `ERAX_AUTO_MIGRATE=true`. Media in production must be `s3`. Rate limiting in production must be Valkey. Email in production must be SMTP. Direct messages still use HTTP refresh and are not end-to-end encrypted.

## Changed files

Production configuration and checks:

- `packages/config/src/index.ts`
- `packages/database/src/client.ts`
- `packages/database/src/cli.ts`
- `packages/database/src/seed.ts`
- `packages/database/src/verify.ts`
- `packages/database/src/verify-cli.ts`
- `packages/database/src/embedded-verify.ts`
- `services/api/src/media-s3.ts`
- `services/api/src/index.ts`
- `services/api/src/server.ts`
- `.env.example`
- `apps/web/vercel.json`
- `apps/admin/vercel.json`

Guides:

- `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
- `docs/PRODUCTION_DATABASE_GUIDE.md`
- `docs/VERCEL_CONFIGURATION.md`
- `docs/PRODUCTION_ENVIRONMENT_VARIABLES.md`
- `docs/PRODUCTION_READINESS_CHECKLIST.md`

## Known issues

- This Windows session runs as Administrator. PostgreSQL 16.15 exited before accepting connections, so migrations were not applied to a live server here.
- Docker is still not installed. Compose was not started.
- Email delivery, object storage, and Valkey were not connected.
- The local PGlite database, when present from earlier development, is not a production dataset and must not be copied to Neon.
- Message delivery remains HTTP polling.

## Test results

```text
Test Files  15 passed | 1 skipped (16)
     Tests  33 passed | 1 skipped (34)
  Duration  44.47s
```

The skipped test is `packages/database/src/postgres-migrate.test.ts`. `pnpm db:verify:embedded` exited 1.

## Next exact implementation step

Wait for approval before creating Neon branches, running `pnpm db:verify` against any remote URL, creating Vercel projects, or changing DNS. Do not start Phase 4.
