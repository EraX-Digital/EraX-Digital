# Vercel configuration

Two Vercel projects deploy the Next.js applications. The Fastify API and the indexer are not Vercel projects. No project has been created and nothing has been deployed.

## Verified commands

These commands were run from a checkout that already had dependencies installed. They match the `package.json` scripts. They are not inferred names.

From `apps/web`:

```text
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` is the package script `next build`. On 2026-11-03 it completed with Next.js 16.4.4 and exited 0.

From `apps/admin`:

```text
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` is that package's `next build`. It exited 0 on the same date.

The root script `pnpm build` is different. It typechecks the workspace and then builds both apps. Do not use it as the Vercel build command for one project.

pnpm is `10.15.0`, from the root `packageManager` field. Node.js is 22 or newer, from the root `engines` field. Set the Vercel project Node.js version to 22.x.

## Project: EraX web

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` |
| Framework | Next.js |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output | Next.js default (`.next`) |
| Production domains | `app.erax.digital`, and `erax.digital` redirected to it |

`apps/web/vercel.json` contains the install and build commands above. Vercel runs those commands for a project whose root directory is `apps/web`. pnpm walks up to the workspace root, so the filter still resolves `@erax/ui`, `@erax/api-client`, and `@erax/shared-types`.

Do not import the repository root as a single Vercel project. There is no root `vercel.json` for that reason.

The web app and the product are the same Next.js app. `/` is the entry page and `/app` is EraX Social. `WEB_ORIGIN` is one origin, so the canonical browser origin is `https://app.erax.digital`. In the Vercel domain settings, add `erax.digital` to this project and redirect it to `https://app.erax.digital`. A separate marketing application is not in the repository.

Required project environment variables:

- `NEXT_PUBLIC_API_URL` = `https://api.erax.digital` for production
- For preview deployments, set `NEXT_PUBLIC_API_URL` to the preview API host, not the production API

`NEXT_PUBLIC_API_URL` is inlined at build time. When it is unset, the app calls `https://api.erax.digital`. A Vercel build still fails if the variable is explicitly set to localhost or to a non-HTTPS URL. Set Node.js 22.x on the project. The project Root Directory must be `apps/web` for this app and `apps/admin` for the admin app. Importing the repository root does not deploy either Next.js app.

Do not add `DATABASE_URL`, `SESSION_COOKIE_SECRET`, SMTP passwords, or S3 keys to this project.

## Project: EraX admin

| Setting | Value |
| --- | --- |
| Root directory | `apps/admin` |
| Framework | Next.js |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output | Next.js default (`.next`) |
| Production domain | `admin.erax.digital` |

`apps/admin/vercel.json` contains those commands. The admin project needs the same public API URL rules as the web project. It does not receive database or signing secrets.

## API and indexer

`services/api` is a Fastify process. Its `build` script is `tsc --noEmit`. It does not emit a JavaScript bundle. `pnpm --filter @erax/api start` runs `tsx src/index.ts`, and `tsx` is a runtime dependency so a production install still includes it.

The process calls `app.listen`, keeps a PostgreSQL pool, and connects to Valkey when configured. Production boot does not migrate unless `ERAX_AUTO_MIGRATE=true`. There is no Vercel function entry. A function entry was not added because this session did not deploy to Vercel and therefore could not verify serverless behavior.

Host the API as a long-running Node.js 22 service. `infrastructure/docker/api.Dockerfile` already starts it with `pnpm start` after `pnpm install --frozen-lockfile`. The image is a suitable artifact for a container host. It was not built or pushed in this session.

The indexer is a second long-running process: `pnpm --filter @erax/indexer start`. It listens on `INDEXER_PORT` (default 4001) and reports that no chain is connected. It does not load the database, S3, or session secret. Do not place it on Vercel. It can share the API's host or use its own process on that host. It has no Dockerfile yet; the start command above is the process to supervise.

Set `TRUST_PROXY=true` on the API only when a reverse proxy in front of it overwrites `X-Forwarded-For`. The proxy must terminate TLS for `https://api.erax.digital`.

## Preview deployments

A Vercel preview of the web app must call a preview API, and that API must use a Neon preview branch. Related Projects were not configured, because the API is not a Vercel project and there is no Vercel project id to put in `relatedProjects`.

Set preview environment variables in the Vercel project and on the preview API host. Do not reuse production `DATABASE_URL`.

## DNS records

No Vercel project exists, so Vercel has not issued this repository a project-specific A or CNAME value. Do not change DNS until the projects and the API host exist. Then copy the values from those dashboards.

Official behavior, from Vercel documentation read on 2026-11-03:

- [Working with nameservers](https://vercel.com/docs/domains/working-with-nameservers) publishes the nameserver hosts `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
- [Adding a custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) says an apex domain uses an A record and a subdomain uses a CNAME. Each project has its own CNAME. The page's example, `d1d4fc829fe7bc7c.vercel-dns-017.com`, is an example, not the EraX target.
- [A records with Vercel](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) says to use the address on the project domain card. It says most cards show `76.76.21.21` and that newer projects can show a different anycast address. The card is the value Vercel will verify. Do not create a record from the example address.

### Option A: nameservers

At the registrar, after copying existing MX and TXT records into Vercel DNS:

| Type | Name | Value |
| --- | --- | --- |
| NS | `@` | `ns1.vercel-dns.com` |
| NS | `@` | `ns2.vercel-dns.com` |

Then add `erax.digital` and `app.erax.digital` to the web project, and `admin.erax.digital` to the admin project. Do not add `api.erax.digital` to a Vercel project. Create its record in Vercel DNS from the API host's own target. That target is not known until the API host is created.

### Option B: records at the current DNS host

After each domain is added to its project, the domain card shows the records. Create only those:

| Hostname | Project | Record to copy from the dashboard |
| --- | --- | --- |
| `erax.digital` | web | The A record shown for this apex on the web project's domain card |
| `app.erax.digital` | web | The CNAME target shown for this hostname |
| `admin.erax.digital` | admin | The CNAME target shown for this hostname |
| `api.erax.digital` | none | The A or CNAME record shown by the API host, not by Vercel |

If Vercel asks to prove ownership, it shows a TXT record at `_vercel` on the apex. Use the value on that screen. Removing and re-adding a domain changes the value.

Redirect `erax.digital` to `https://app.erax.digital` in the web project's domain settings after both names are valid. Vercel provisions the certificates for the two Next.js projects. The API certificate is the responsibility of the API host.
