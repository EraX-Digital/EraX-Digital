# Demo content seeding

Demo rows are fictional. Usernames, bios, posts, comments, and communities are marked with `demo_marks.batch = socialfi-demo-2026-11`. Bios say they are demo profiles. Posts include the text `Demo note`.

The batch contains 8 users, 4 communities, 100 public posts, 20 comments, a follow ring, and 12 likes between those demo users. There are no wallets and no on-chain events. The local password for every demo account is `local-demo-pass-1`. Emails look like `mira_ell@demo.erax.invalid`. Do not reuse that password anywhere except this fixture.

Commands, from the repository root:

```powershell
pnpm db:seed:socialfi
pnpm db:seed:socialfi:staging
pnpm db:seed:socialfi:production
pnpm db:seed:socialfi:cleanup
```

`pnpm db:seed:socialfi` is the local command. It runs when `DATABASE_DRIVER=pglite`, or when the Postgres host is localhost, 127.0.0.1, or ::1. It refuses `NODE_ENV=production`.

Staging requires `--staging` and `ERAX_DEMO_SEED_STAGING=1`, and it refuses PGlite and local hosts.

Production requires `--production` and `--confirm=seed-socialfi-demo-production`. Without that flag the command throws. It is not the default, and it was not run for this upgrade.

Running the local seed again is idempotent. If 100 demo posts from this batch are already marked, it inserts nothing. If a partial batch is present, it stops and asks for cleanup. If a real profile already uses a demo username, it refuses to overwrite that profile.

Cleanup deletes only rows whose ids are listed in `demo_marks` for this batch: comments, posts, communities, then users, then the marks. Deleting a demo user also cascades rows that belong to that user. An unmarked user and that user’s posts are left in place. A second cleanup deletes nothing. Cleanup never runs a table-wide delete.

This upgrade ran the seed only inside the Vitest PGlite memory database. It did not seed a developer PGlite directory, staging, or production.
