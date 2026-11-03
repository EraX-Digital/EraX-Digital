# Production database guide

The production database is managed PostgreSQL through Neon. PGlite is not a production database. This repository does not connect to Neon until an operator runs the migration command against a Neon URL.

## Current evidence

On 2026-11-03 this machine did not apply the migrations to a running PostgreSQL server.

`pnpm db:verify:embedded` started the PostgreSQL 16.15 binaries shipped by `embedded-postgres@16.15.0-beta.19` (`@embedded-postgres/windows-x64`). `initdb` completed. The server then stopped with:

```text
Execution of PostgreSQL by a user with administrative permissions is not permitted.
The server must be started under an unprivileged user ID to prevent
possible system security compromises.
```

The command exited 1. No tables were created because the server never accepted a connection. The local test `packages/database/src/postgres-migrate.test.ts` remains skipped because `DATABASE_URL` is not set for `pnpm test`.

`.github/workflows/ci.yml` starts `postgres:16-alpine`, sets `DATABASE_URL`, and runs `pnpm test`. That test calls `verifyPostgres`. The workflow was not executed in this session, so CI is not evidence either.

Do not describe the schema as verified on Neon or on a running PostgreSQL server until one of those runs succeeds.

What was checked without a server:

- `packages/database/migrations/0001_foundation.sql` and `0002_social.sql` contain no `DROP TABLE`, `DROP DATABASE`, `DROP SCHEMA`, or `TRUNCATE`.
- The migrator applies a new file once, stores its SHA-256 checksum in `schema_migrations`, and refuses to continue if an applied file changes.
- Production configuration rejects `DATABASE_DRIVER=pglite`, a localhost database URL, and `DATABASE_SSL=disable`.

## Environments

Use three separate databases. Do not point preview or local processes at the production branch.

| Environment | Database | Who migrates | Seed |
| --- | --- | --- | --- |
| Local development | Docker Compose `postgres:16-alpine`, database `erax`, or PGlite when Docker is absent | `pnpm db:migrate` on boot of the local API | `pnpm db:seed` only for a local administrator |
| Preview | A Neon branch that is not production | `pnpm db:verify` against that branch's direct URL | Never |
| Production | The Neon production branch | `pnpm db:verify` once, after the operator approves the command | Never |

Local Docker Compose uses user `erax`, password `erax_local_dev_only`, and database `erax`. Those values are development-only. Production startup rejects a URL that contains them.

PGlite data stays in `var/pglite`. It is selected only by `DATABASE_DRIVER=pglite`.

## Connection strings

Neon provides two connection strings. Use both.

- `DATABASE_URL`: the pooled Neon URL, normally the host containing `-pooler`. The API uses this for requests.
- `DATABASE_MIGRATION_URL`: the direct Neon URL, without the pooler. Migrations and `pnpm db:verify` use this when it is set. Session-level migration statements are not run through the transaction pooler.
- `DATABASE_SSL=require`: the `pg` pool uses TLS and verifies the server certificate.
- `DATABASE_POOL_MAX`: default `10`, maximum `20`. This is a small pool for one long-running API process. Neon already pools on the `-pooler` host, so do not raise this to fill a serverless fan-out. The API is not deployed as a serverless function.

The runtime pool sets `application_name` to `erax`. It does not open a PGlite client when `DATABASE_DRIVER=postgres`.

## Migration process

The migration files are additive. The runner does not drop or reset a database. A remote host is refused unless the same command sets `ERAX_APPROVE_REMOTE_MIGRATE=1`. Do not put that variable in `.env`. Set it only in the shell for the command you have reviewed.

1. Create the Neon production branch and a separate preview branch. Copy the direct URL and the pooled URL from the Neon dashboard.
2. Confirm the host name in the direct URL is the branch you intend to change.
3. From a shell that already has the other required variables, or from a production-shaped environment file that is not committed:

```powershell
$env:DATABASE_DRIVER = "postgres"
$env:DATABASE_URL = "postgres://USER:PASSWORD@POOLED-HOST/DATABASE?sslmode=require"
$env:DATABASE_MIGRATION_URL = "postgres://USER:PASSWORD@DIRECT-HOST/DATABASE?sslmode=require"
$env:DATABASE_SSL = "require"
$env:ERAX_APPROVE_REMOTE_MIGRATE = "1"
pnpm db:verify
```

`pnpm db:verify` prints the host and database name, not the password. It then:

- applies any migration whose checksum is not already stored
- applies them again and expects the second run to add nothing
- checks the public tables, the named indexes, foreign keys, and the `users` column types `uuid`, `text`, and `timestamp with time zone`
- inserts a row and rolls it back
- inserts a duplicate email and expects PostgreSQL unique-violation `23505`, then rolls back
- inserts a profile for an unknown user and expects foreign-key violation `23503`, then rolls back
- reports `current_user` and whether that role is a superuser

It does not issue `DROP`, `TRUNCATE`, or `DELETE` against existing rows. The probe rows are rolled back.

4. Leave `ERAX_AUTO_MIGRATE` unset on the production API. Production boot does not migrate unless that variable is exactly `true`. Run the command above before starting or restarting API instances.
5. Repeat against the preview branch with the preview URLs before pointing a preview API at it.
6. `pnpm db:migrate` is the same SQL apply without the rollback and constraint probes. It has the same remote-host guard. Prefer `pnpm db:verify` the first time.

If a migration file changes after it has been applied, the runner stops with a checksum error. Fix that with a new file. Do not edit an applied file and do not drop `schema_migrations` to force a rerun.

## Seed data

`pnpm db:seed` creates one development administrator (`erax_admin`) and one audit row. It does not create posts, messages, communities, or statistics.

It throws in both of these cases:

- `NODE_ENV=production`
- `DATABASE_URL` or `DATABASE_MIGRATION_URL` uses a host other than `localhost`, `127.0.0.1`, or `::1`

There is no environment variable that overrides the remote-host refusal. Do not add a production seed.

## Database permissions

The verification report includes whether `current_user` is a superuser. On a local embedded or Docker cluster the owner is often a superuser. For Neon, prefer the platform role Neon gives the branch and do not use a superuser connection for the API.

The API role needs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the application tables. It does not need permission to drop the database. This repository cannot grant or check that permission until it is connected to the target server. Review the role in the Neon dashboard before the first migration.

## What is still not proven

- A completed `verifyPostgres` run against PostgreSQL 16 or Neon.
- TLS to a Neon host.
- Behavior of the Neon pooler under load.
- Restores, backups, and branch resets. Do not reset the production branch from a local script.
