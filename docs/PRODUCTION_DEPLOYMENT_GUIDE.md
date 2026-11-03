# Production deployment guide

This guide prepares a launch. It does not perform one. No Vercel project was created, no DNS record was changed, and no migration was run against Neon.

The application is not production-ready. Local tests passed, and that is not sufficient. The gaps are listed in `docs/PRODUCTION_READINESS_CHECKLIST.md`.

## What depends on local development

| Local behavior | Where it lives | Production rule |
| --- | --- | --- |
| PGlite | `DATABASE_DRIVER=pglite`, `PGLITE_DIR` | Rejected. Use Neon PostgreSQL. |
| Filesystem uploads | `MEDIA_DRIVER=filesystem`, `MEDIA_ROOT` | Rejected. Use the S3-compatible adapter. |
| Email outbox | `EMAIL_MODE=outbox`, `GET /api/v1/dev/outbox` | Rejected. The route responds 404 when `NODE_ENV=production`. SMTP is required and has not been delivery-tested. |
| Localhost origins and URLs | `.env.example`, `apps/web/.env.development`, `apps/admin/.env.development` | Production origins must be `https`. Database, Valkey, and SMTP hosts must not be localhost. |
| In-process rate limit | `RATE_LIMIT_STORE=memory` | Rejected. Valkey is required and was not connected here. |
| Development administrator | `pnpm db:seed` | Refuses `NODE_ENV=production` and any non-local database host. There is no login bypass. |
| Fallback API URL | `http://127.0.0.1:4000` | Used only when `NEXT_PUBLIC_API_URL` is unset and `VERCEL_ENV` is not `preview` or `production`. |

Wallet signature login still returns HTTP 501. Bodies that contain a private key, seed, or mnemonic are rejected. The indexer does not connect to a chain.

## Host map

| Hostname | Software | Where it runs |
| --- | --- | --- |
| `erax.digital` | `apps/web`, redirected to `https://app.erax.digital` | Vercel project, root directory `apps/web` |
| `app.erax.digital` | `apps/web` | Same Vercel project |
| `admin.erax.digital` | `apps/admin` | Separate Vercel project, root directory `apps/admin` |
| `api.erax.digital` | `services/api` | A long-running Node.js 22 service. Not a Vercel function. |
| No public hostname required | `services/indexer` | A second long-running process on a normal host. Not a Vercel function. |

Direct messages refresh over HTTP. There is no WebSocket server, and the notification summary reports `realtime: false`. Real-time messaging is not production-ready.

There is no background job worker. Notification rows are written during the request that caused them. The indexer is the only extra process, and it does not index a chain. Do not describe background processing as production-ready.

## Order of operations

Stop after the step that needs approval. The commands below are the ones to run later. They were not run against Neon, Vercel, or the DNS host.

### 1. Create empty infrastructure

Create these resources and keep their secrets in the host dashboards:

- A Neon project with a production branch and a separate preview branch.
- An S3-compatible bucket that is not public. Block anonymous reads.
- A Valkey or other Redis-protocol service reachable with `rediss://`.
- An SMTP provider for `no-reply@erax.digital`.
- A container or virtual machine for the API, with TLS in front of it.
- A process supervisor for the indexer on that machine or another one.

Do not paste those secrets into the repository or into `NEXT_PUBLIC_` variables.

### 2. Verify the preview database

Follow `docs/PRODUCTION_DATABASE_GUIDE.md` against the preview branch's direct URL. The command is `pnpm db:verify` with `ERAX_APPROVE_REMOTE_MIGRATE=1` set in that shell only.

Review the printed host before you set the approval variable. The script does not drop tables. It has not been observed against a live server yet, so treat the first preview run as the compatibility test. If it fails, stop. Do not point the production branch at the same command until the preview run's JSON report shows the rollback, unique, and foreign-key checks passed.

### 3. Start the preview API

Use a production-shaped environment with the preview database, preview Valkey, the S3 bucket, and SMTP. Leave `ERAX_AUTO_MIGRATE` unset. Set `TRUST_PROXY` only if the TLS proxy overwrites the forwarding header.

```powershell
pnpm --filter @erax/api start
pnpm --filter @erax/indexer start
```

`GET /health` should return `{"status":"ok","service":"api"}`. `GET /ready` should return 200 only when both the database query and Valkey `PING` succeed. A database error detail must not contain a `postgres://` URL.

Confirm `GET /api/v1/dev/outbox` returns 404 and `/docs` is absent because `ENABLE_API_DOCS=false`.

### 4. Create the Vercel projects without using production data

Create two projects from this repository. Settings and the verified commands are in `docs/VERCEL_CONFIGURATION.md`.

Set preview `NEXT_PUBLIC_API_URL` to the preview API. Deploy a preview, not production, and walk the checklist against it. Do not promote the deployment.

### 5. Approve the production migration

Repeat `pnpm db:verify` with the production branch's direct URL only after the preview checklist passes. This is the explicit migration approval. There is no other production migration step.

Then start the production API with the pooled `DATABASE_URL` and the production origins:

- `WEB_ORIGIN=https://app.erax.digital`
- `ADMIN_ORIGIN=https://admin.erax.digital`
- `API_PUBLIC_ORIGIN=https://api.erax.digital`
- `COOKIE_DOMAIN=.erax.digital`
- `COOKIE_SECURE=true`

### 6. Deploy the Vercel production targets

Set production `NEXT_PUBLIC_API_URL=https://api.erax.digital` on both projects and deploy. Confirm the browser calls `api.erax.digital` and not a `vercel.app` preview API.

### 7. DNS

Use `docs/VERCEL_CONFIGURATION.md`. Copy the A and CNAME values from the Vercel domain cards and the API host. Do not copy an address from an example in the Vercel docs. Change DNS only after the production API `/ready` check is green.

### 8. SMTP delivery test

Register a real mailbox you control on the preview or production API. Open the message in that mailbox and complete verification. A successful API response is not a delivery test. The outbox is not a delivery test. Until that mailbox receives the message, email is not working.

## Rollback

Application rollback is a Vercel promotion of an earlier web or admin deployment, plus a restart of the API at a previous release. Database rollback is a Neon point-in-time restore or a branch restore performed in the Neon dashboard. Do not drop tables from this repository to roll back. The migration runner will not reverse an applied file.

## Security controls already in the process

- HTTPS is required for the three public origins, and cookies are marked `Secure`.
- CORS allows only `WEB_ORIGIN`, `ADMIN_ORIGIN`, and `API_PUBLIC_ORIGIN`.
- Mutating `/api/` requests must send an allowed `Origin`. Session mutations also require `x-erax-csrf`.
- The global rate limit is 300 requests per minute, with tighter limits on authentication and social writes, stored in Valkey when `RATE_LIMIT_STORE=valkey`.
- Passwords use Argon2id. Session and CSRF tokens are stored as SHA-256 hashes. The session cookie is `HttpOnly`.
- Admin routes require an admin role. The development seed cannot run against production or a remote host.
- Upload size is limited to 20 MB. Image and video bytes are checked by signature, and object keys must stay under `avatars/`, `covers/`, `posts/`, or `communities/`.
- Unhandled errors return `internal_error` without a stack trace. Readiness details drop connection strings. Request logs redact the cookie, authorization, and CSRF headers.
- API docs are off in production.

These controls were exercised by the local test suite against PGlite, not against the production host.
