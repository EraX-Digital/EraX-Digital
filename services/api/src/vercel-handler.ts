import { randomBytes } from 'node:crypto'
import { parseEnv, type Env } from '@erax/config'
import { createDatabase, migrateDatabase, type SqlExecutor } from '@erax/database'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server'
import { createLinkSender, createSmtpSender } from './email'
import { createS3Storage } from './media-s3'
import { createUnavailableStorage } from './media'

type Source = Record<string, string | undefined>

const NOT_CONFIGURED = {
  error: {
    code: 'accounts_not_configured',
    message:
      'This deployment has no database, so an account cannot be created or used. Add a Postgres connection string as DATABASE_URL or POSTGRES_URL in the Vercel project, then redeploy.',
    details: null,
  },
}

function usablePostgresUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed.startsWith('postgres')) return ''
  try {
    const parsed = new URL(trimmed)
    parsed.searchParams.delete('channel_binding')
    return parsed.toString()
  } catch {
    return trimmed.replace(/([?&])channel_binding=[^&]*&?/g, '$1').replace(/[?&]$/, '')
  }
}

function isPooledNeonUrl(value: string): boolean {
  return /-pooler[./]/i.test(value)
}

export function readDatabaseUrl(source: Source): string {
  const candidates = [
    source.POSTGRES_URL_NON_POOLING,
    source.DATABASE_URL_UNPOOLED,
    source.DATABASE_URL,
    source.POSTGRES_URL,
    source.POSTGRES_PRISMA_URL,
  ]
  const urls = candidates.map(usablePostgresUrl).filter((value) => value.length > 0)
  return urls.find((value) => !isPooledNeonUrl(value)) ?? urls[0] ?? ''
}

export function deploymentOrigin(source: Source): string {
  const host =
    source.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    source.VERCEL_URL?.trim() ||
    'erax-digital.vercel.app'
  return host.startsWith('http') ? host : `https://${host}`
}

export function vercelConfigSource(source: Source, sessionSecret: string): Source {
  const origin = deploymentOrigin(source)
  const smtp = source.SMTP_HOST?.trim() ?? ''
  const valkey = source.VALKEY_URL?.trim() ?? ''
  const bucket = source.S3_BUCKET?.trim() ?? ''
  const httpsOrigin = (value: string | undefined) =>
    value?.startsWith('https://') ? value : origin
  return {
    ...source,
    NODE_ENV: 'production',
    ERAX_RUNTIME: 'vercel',
    ERAX_AUTO_MIGRATE: 'true',
    DATABASE_DRIVER: 'postgres',
    DATABASE_URL: readDatabaseUrl(source),
    DATABASE_SSL: 'require',
    DATABASE_POOL_MAX: '1',
    RATE_LIMIT_STORE: valkey.length > 0 && !/localhost|127\.0\.0\.1/i.test(valkey) ? 'valkey' : 'memory',
    EMAIL_MODE: smtp.length > 0 ? 'smtp' : 'link',
    MEDIA_DRIVER: bucket.length > 0 ? 's3' : 'none',
    ENABLE_API_DOCS: 'false',
    COOKIE_SECURE: 'true',
    TRUST_PROXY: 'true',
    WEB_ORIGIN: httpsOrigin(source.WEB_ORIGIN),
    ADMIN_ORIGIN: httpsOrigin(source.ADMIN_ORIGIN),
    API_PUBLIC_ORIGIN: httpsOrigin(source.API_PUBLIC_ORIGIN),
    SESSION_COOKIE_SECRET: sessionSecret,
    COOKIE_DOMAIN: source.COOKIE_DOMAIN ?? '',
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The account service failed to start'
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database]').slice(0, 400)
}

async function sessionSecret(executor: SqlExecutor, configured: string | undefined): Promise<string> {
  const existing = configured?.trim() ?? ''
  if (existing.length >= 32 && !existing.includes('replace-with')) return existing
  await executor.exec(`CREATE TABLE IF NOT EXISTS runtime_secrets (
    name text PRIMARY KEY,
    value text NOT NULL
  )`)
  const found = await executor.query(`SELECT value FROM runtime_secrets WHERE name = 'session_cookie'`)
  const stored = found.rows[0]?.value
  if (typeof stored === 'string' && stored.length >= 32) return stored
  const generated = randomBytes(32).toString('base64url')
  await executor.exec(
    `INSERT INTO runtime_secrets (name, value) VALUES ('session_cookie', '${generated}') ON CONFLICT (name) DO NOTHING`,
  )
  const reread = await executor.query(`SELECT value FROM runtime_secrets WHERE name = 'session_cookie'`)
  const value = reread.rows[0]?.value
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error('The session secret could not be stored')
  }
  return value
}

type RunningApi = {
  app: FastifyInstance
  env: Env
}

let starting: Promise<RunningApi> | null = null

async function boot(): Promise<RunningApi> {
  const databaseUrl = readDatabaseUrl(process.env)
  if (!databaseUrl) throw new Error('accounts_not_configured')
  const runtime = await createDatabase({
    DATABASE_DRIVER: 'postgres',
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: 1,
    DATABASE_SSL: 'require',
    PGLITE_DIR: ':memory:',
  })
  await migrateDatabase(runtime)
  const secret = await sessionSecret(runtime.executor, process.env.SESSION_COOKIE_SECRET)
  const env = parseEnv(vercelConfigSource(process.env, secret))
  const email =
    env.EMAIL_MODE === 'smtp'
      ? createSmtpSender({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          from: env.SMTP_FROM,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
        })
      : createLinkSender()
  const media =
    env.MEDIA_DRIVER === 's3'
      ? createS3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        })
      : createUnavailableStorage()
  const app = await buildServer({
    env,
    db: runtime.db,
    closeDb: () => runtime.close(),
    checkDatabase: () => runtime.ping(),
    checkValkey: async () => {
      if (env.RATE_LIMIT_STORE === 'valkey') throw new Error('Valkey is not connected')
    },
    email,
    media,
  })
  await app.ready()
  return { app, env }
}

function appPromise(): Promise<RunningApi> {
  if (!starting) {
    starting = boot().catch((error: unknown) => {
      starting = null
      throw error
    })
  }
  return starting
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function handleVercelApi(request: Request): Promise<Response> {
  if (!readDatabaseUrl(process.env)) return jsonResponse(503, NOT_CONFIGURED)
  try {
    const running = await appPromise()
    const url = new URL(request.url)
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    const payload =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.from(await request.arrayBuffer())
    const injected = await running.app.inject({
      method: request.method as 'GET',
      url: `${url.pathname}${url.search}`,
      headers,
      payload,
    })
    const responseHeaders = new Headers()
    for (const [key, value] of Object.entries(injected.headers)) {
      if (value === undefined || key.toLowerCase() === 'content-length') continue
      if (Array.isArray(value)) {
        for (const item of value) responseHeaders.append(key, item)
      } else {
        responseHeaders.set(key, String(value))
      }
    }
    const bytes = new Uint8Array(injected.rawPayload.byteLength)
    bytes.set(injected.rawPayload)
    return new Response(bytes, { status: injected.statusCode, headers: responseHeaders })
  } catch (error) {
    if (error instanceof Error && error.message === 'accounts_not_configured') {
      return jsonResponse(503, NOT_CONFIGURED)
    }
    return jsonResponse(503, {
      error: { code: 'accounts_unavailable', message: safeMessage(error), details: null },
    })
  }
}
