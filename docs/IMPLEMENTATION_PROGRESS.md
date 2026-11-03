# EraX Digital — Implementation Progress

Last updated: 2026-11-03

## Current status

Phase 3 is implemented and verified on this machine. Do not start Phase 4 until `docs/PHASE_3_COMPLETION_REPORT.md` is approved.

EraX Social now has profiles, posts, feeds, follows, communities, messages, notifications, and search on top of the Phase 2 accounts. Wallet signature login, live Valkey, Docker, SMTP delivery, and a real PostgreSQL server remain outstanding.

## Completed tasks

Phase 1 audits and the Phase 2 foundation remain in place. Phase 3 added migration `0002_social`, the social API, and the EraX Social screens.

Verified in this session:

- `pnpm typecheck` exited 0.
- `pnpm lint` exited 0.
- `pnpm test` — 10 files passed, 1 skipped, 24 tests passed, 1 skipped.
- Web and admin production builds exited 0.
- `GET /api/v1/feeds/discover` returned an empty page before any new public post existed.
- The signed-in home page rendered the navigation and empty following feed, then showed a post after it was stored.

## Remaining tasks

After approval, Phase 4 in the original plan covers a broader social product that this phase has already started: richer media, realtime delivery, and moderation. The outstanding platform dependencies are:

- SIWE and SIWS signature verification.
- Docker, PostgreSQL 16, and Valkey on this machine.
- SMTP delivery. The development outbox remains the exercised email path.
- WebSocket message delivery. Messages currently use HTTP and a refresh interval.

Do not add a token, contracts, custodial keys, or chain deployment in that step.

## Current architecture

The Phase 2 modular monolith is unchanged. Social data lives in the same PostgreSQL schema and the same Fastify process. This host still uses PGlite and the in-process rate limiter. Production configuration rejects that combination.

Direct messages are visible only to participants. They are not end-to-end encrypted. The indexer still reports that no chain is connected.

## Changed files

Social schema and API:

- `packages/database/migrations/0002_social.sql`
- `packages/database/src/schema.ts`
- `services/api/src/social.ts`
- `services/api/src/social-routes.ts`
- `services/api/src/media.ts`
- `services/api/src/media-bytes.ts`
- `apps/web` social screens under `app/app`, `app/p`, and `components`

## Known issues

- Docker is not installed, so Compose was not started.
- The PostgreSQL server migration test skips unless `DATABASE_URL` is set.
- Email is stored in `var/outbox` and is not delivered.
- The local PGlite database contains the development admin, the Phase 2 verification account, and one post published from the home composer during this check.
- Message delivery refreshes over HTTP. A live socket is not connected.

## Test results

```text
Test Files  10 passed | 1 skipped (11)
     Tests  24 passed | 1 skipped (25)
  Duration  38.08s
```

The skipped test is the PostgreSQL server migration.

## Next exact implementation step

Wait for approval of `docs/PHASE_3_COMPLETION_REPORT.md`. Do not start Phase 4 automatically.
