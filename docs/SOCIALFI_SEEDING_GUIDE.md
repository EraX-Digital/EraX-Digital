# EraX Social — demo seeding guide

The seed lives in `packages/database/seeds/socialfi-demo-content.ts` and `packages/database/src/socialfi-demo.ts`. The command is `pnpm --filter @erax/database seed:socialfi`.

Demo emails use `@demo.erax.invalid`. The fixture password is in the seed module and is only for local sign-in. Do not reuse it for a real account.

## Commands

Dry-run, no database connection:

```text
pnpm --filter @erax/database seed:socialfi -- --dry-run
```

Local seed. This writes the database selected by the local environment. The checked-in local driver is PGlite. It refuses `NODE_ENV=production` and it refuses a remote Postgres URL when the driver is `postgres`.

```text
pnpm --filter @erax/database seed:socialfi
```

Count rows tagged with this batch:

```text
pnpm --filter @erax/database seed:socialfi -- --count
```

Cleanup deletes only ids listed in `demo_marks` for `socialfi-demo-2026-11`: comments, posts, communities, then users. Follows, likes, polls, memberships, and mentions cascade from those rows. A hashtag is removed only when no post still references it. A second cleanup deletes nothing.

```text
pnpm --filter @erax/database seed:socialfi -- --cleanup
```

Staging also requires the environment flag and refuses PGlite and local hosts:

```text
$env:ERAX_DEMO_SEED_STAGING='1'
pnpm --filter @erax/database seed:socialfi -- --staging
```

Production is not the default. The command throws unless the confirm flag is present. Do not run it against the Neon database used by the Vercel deployment unless that write has been approved.

```text
pnpm --filter @erax/database seed:socialfi -- --production --confirm=seed-socialfi-demo-production
```

## Repeat behavior

A second seed against a finished batch returns `seeded: false` and does not insert again. A batch that stopped halfway throws and asks for cleanup first, so it cannot create a second copy of `mira_ell` or the other fixture usernames. An existing real username that matches a fixture name also stops the seed before any insert.

## What this pass executed

`--dry-run` printed the plan and did not open a database.

The local seed then wrote `./var/pglite`. The command’s own count returned 25 users, 120 posts, 300 comments, 200 likes, 80 reposts, 40 bookmarks, 60 follows, 10 communities, 30 memberships, 17 hashtags, 10 polls, and 30 votes. Running it again returned `already-present` with the same counts.

The same insert was also proven on a fresh in-memory database by the seed test, including cleanup that left a non-demo user untouched.

The production command was not executed.
