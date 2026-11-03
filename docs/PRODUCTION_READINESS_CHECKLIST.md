# Production readiness checklist

Run this list against a preview API and a Neon preview branch before any public DNS change. Nothing below has been executed against Neon, Vercel, SMTP, S3, or Valkey.

The local suite on 2026-11-03 was `pnpm typecheck` exit 0, `pnpm lint` exit 0, and `pnpm test` with 33 passed and 1 skipped. The skipped test is the live PostgreSQL verification. `pnpm build` inside `apps/web` and `apps/admin` exited 0. That does not mark this checklist complete.

Status values: `not run`, `passed`, `failed`.

## Build and configuration

- [ ] Clean checkout: `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --dir apps/web build`, and `pnpm --dir apps/admin build`. Current machine: install and the two app builds passed after dependencies were already present. A second clean-checkout install was not repeated.
- [ ] Production API process fails startup when `DATABASE_DRIVER=pglite`, `MEDIA_DRIVER=filesystem`, `EMAIL_MODE=outbox`, `RATE_LIMIT_STORE=memory`, or `COOKIE_SECURE=false`. Covered by `packages/config/src/index.test.ts` with a fixture, not by a deployed process.
- [ ] Vercel project Root Directory is `apps/web` or `apps/admin`, not the repository root. An unset `NEXT_PUBLIC_API_URL` builds against `https://api.erax.digital`. An explicit localhost URL fails the build.
- [ ] Preview and production Vercel projects use separate `NEXT_PUBLIC_API_URL` values. Not run.

## Database

- [ ] `pnpm db:verify` against the Neon preview direct URL prints `transactionRollback`, `uniqueViolation`, and `foreignKeyViolation` as `passed`, and the second migration run applies nothing. Not run. The local PostgreSQL 16.15 server refused to start under the Administrator account, so this machine has no passing server result.
- [ ] The same command against the production branch, only after the preview result is accepted. Not run.
- [ ] `pnpm db:seed` against the preview URL exits with `Refusing to seed`. Not run against a remote URL. The guard is unit-tested.
- [ ] Production API `DATABASE_URL` is the pooled Neon URL, and migrations used the direct URL. Not configured.
- [ ] `GET /ready` database check is ok and its error text, if forced, contains no password or `postgres://` URL. The redaction helper is unit-tested. The live check was not run.

## Accounts

- [ ] Registration creates an unverified user and does not leave a session that can call member routes.
- [ ] The verification message arrives in a real mailbox. SMTP delivery is not tested. The development outbox does not count.
- [ ] Login before verification is rejected. Login after verification sets `erax_session` as `HttpOnly` and `Secure`.
- [ ] Password reset works from the real mailbox and the old password stops working.
- [ ] Profile update, including a cover upload stored in the S3 bucket, is visible after refresh.

## Social

- [ ] A signed-in user can publish a post and see it on the home feed.
- [ ] Another user can comment, and a one-level reply stays attached to that comment.
- [ ] Follow changes the following feed. A block hides the blocked person's content.
- [ ] A public community is joinable. A private community is not readable by an outsider.
- [ ] A direct message is visible to the two participants and is not returned to anyone else.
- [ ] A notification appears for the recipient through the HTTP notification request. No live socket is expected. `realtime` stays false.
- [ ] An uploaded image is served from object storage and a renamed non-image file is rejected.

## Administration and health

- [ ] An ordinary member receives 403 or 404 from admin routes.
- [ ] The seeded development admin is absent from production. Create any real administrator through a reviewed production procedure, not `pnpm db:seed`.
- [ ] `GET /health` on the API returns `{"status":"ok","service":"api"}`.
- [ ] `GET /ready` returns 200 only when PostgreSQL and Valkey are both reachable.
- [ ] `GET /health` on the indexer returns `{"status":"ok","service":"indexer"}` and its ready payload still says no chain is connected.
- [ ] An unhandled failure returns `internal_error` with no stack trace and no database URL.
- [ ] `GET /api/v1/dev/outbox` returns 404 and `/docs` is not mounted.

## Launch gate

Do not change public DNS, and do not send traffic to `erax.digital`, until every item above is `passed` on the preview stack and the production migration report has been read. This repository is not at that gate.
