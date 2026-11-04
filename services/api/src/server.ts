import { indexingStatus } from '@erax/blockchain-common'
import { resolveRepoPath, type Env } from '@erax/config'
import type { Database } from '@erax/database'
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '@erax/shared-types'
import { siweStatus } from '@erax/wallet-evm'
import { siwsStatus } from '@erax/wallet-solana'
import { createChainReaders, type ChainReaders } from './chain-readers'
import { registerWalletRoutes } from './wallet-routes'
import { createWalletService } from './wallets'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { createAccountService, type AccountService } from './accounts'
import { readOutbox, type EmailSender } from './email'
import { ApiError, errorBody } from './errors'
import { publicCheckDetail } from './public-error'
import { sniffMedia } from './media-bytes'
import type { MediaStorage } from './media'
import { createProductService } from './product'
import { registerSocialRoutes } from './social-routes'
import { createSocialService } from './social'

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  username: z.string().min(3).max(20),
  displayName: z.string().min(1).max(50).optional(),
})

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

const emailBody = z.object({
  email: z.string().email(),
})

const tokenBody = z.object({
  token: z.string().min(20),
})

const resetBody = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(128),
})

const profileBody = z.object({
  username: z.string().min(3).max(20).optional(),
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(280).optional(),
  website: z.string().max(300).nullable().optional(),
  location: z.string().max(80).nullable().optional(),
  socialLinks: z
    .array(z.object({ label: z.string().min(1).max(30), url: z.string().min(1).max(300) }))
    .max(5)
    .optional(),
  visibility: z.enum(['public', 'private']).optional(),
  creatorStatus: z.enum(['none', 'creator']).optional(),
})

const statusBody = z.object({
  status: z.enum(['active', 'suspended']),
})

export type ServerDeps = {
  env: Env
  db: Database
  closeDb: () => Promise<void>
  checkDatabase: () => Promise<void>
  checkValkey: () => Promise<void>
  email: EmailSender
  media: MediaStorage
  redis?: Redis
  now?: () => Date
  writeRateMax?: number
  chainReaders?: ChainReaders
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_input', 'Request validation failed', parsed.error.flatten())
  }
  return parsed.data
}

function clientIp(request: FastifyRequest): string | null {
  return request.ip ?? null
}

export async function buildServer(deps: ServerDeps) {
  const env = deps.env
  const now = deps.now ?? (() => new Date())
  const accounts: AccountService = createAccountService({
    db: deps.db,
    email: deps.email,
    media: deps.media,
    webOrigin: env.WEB_ORIGIN,
    apiOrigin: env.API_PUBLIC_ORIGIN,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    now,
  })
  const readers = deps.chainReaders ?? createChainReaders(env)
  const walletService = createWalletService({
    db: deps.db,
    webOrigin: env.WEB_ORIGIN,
    now,
    trustedTokenJson: env.TRUSTED_TOKEN_LIST_JSON,
    evmReaders: readers.evm,
    solanaReaders: readers.solana,
    openSession: (userId, ip, userAgent) => accounts.openSession(userId, ip, userAgent),
  })
  const allowedOrigins = new Set([env.WEB_ORIGIN, env.ADMIN_ORIGIN, env.API_PUBLIC_ORIGIN])

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.cookie', 'req.headers.authorization', `req.headers["${CSRF_HEADER}"]`],
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 25_000_000,
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(errorBody(error))
    }
    const known = error as { statusCode?: number; validation?: unknown; code?: string }
    if (known.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'rate_limited', message: 'Too many requests', details: null },
      })
    }
    if (known.validation) {
      return reply.status(400).send({
        error: {
          code: 'invalid_input',
          message: 'Request validation failed',
          details: known.validation,
        },
      })
    }
    request.log.error(
      { name: error instanceof Error ? error.name : 'Error' },
      publicCheckDetail(error, 'unhandled error'),
    )
    return reply.status(known.statusCode && known.statusCode >= 400 ? known.statusCode : 500).send({
      error: { code: 'internal_error', message: 'Internal server error', details: null },
    })
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: [...allowedOrigins],
    credentials: true,
    allowedHeaders: ['content-type', CSRF_HEADER],
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 20_000_000, files: 4 } })
  await app.register(rateLimit, {
    global: true,
    max: env.NODE_ENV === 'test' ? 10_000 : 300,
    timeWindow: '1 minute',
    ...(deps.redis ? { redis: deps.redis } : {}),
  })

  if (env.ENABLE_API_DOCS) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'EraX API',
          version: '0.2.0',
          description:
            'EraX Social API. Wallet sign-in verifies SIWE and SIWS signatures. The API does not store private keys or broadcast transactions. Direct messages use request-response delivery, not end-to-end encryption. The development outbox does not send email.',
        },
      },
    })
    await app.register(swaggerUi, { routePrefix: '/docs' })
  }

  app.addHook('onRequest', async (request) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return
    if (!request.url.startsWith('/api/')) return
    const origin = request.headers.origin
    if (origin && allowedOrigins.has(origin)) return
    const host = request.headers.host
    if (origin && host) {
      try {
        if (new URL(origin).host === host) return
      } catch {
        // The origin header is not a URL. Reject it below.
      }
    }
    throw new ApiError(403, 'origin_rejected', 'Origin is not allowed')
  })

  const cookieBase = {
    path: '/',
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
  }

  const sessionCookie = { ...cookieBase, httpOnly: true }
  const csrfCookie = {
    ...cookieBase,
    httpOnly: false,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }

  function setSessionCookies(reply: FastifyReply, sessionToken: string, csrfToken: string) {
    reply.setCookie(SESSION_COOKIE, sessionToken, {
      ...sessionCookie,
      maxAge: env.SESSION_TTL_SECONDS,
    })
    reply.setCookie(CSRF_COOKIE, csrfToken, {
      ...csrfCookie,
      maxAge: env.SESSION_TTL_SECONDS,
    })
  }

  function clearSessionCookies(reply: FastifyReply) {
    reply.clearCookie(SESSION_COOKIE, sessionCookie)
    reply.clearCookie(CSRF_COOKIE, csrfCookie)
  }

  async function requireSession(request: FastifyRequest, requireCsrf: boolean) {
    return accounts.sessionFromToken(
      request.cookies[SESSION_COOKIE],
      request.headers[CSRF_HEADER] as string | undefined,
      requireCsrf,
    )
  }

  app.get(
    '/health',
    {
      schema: { tags: ['system'] },
    },
    async () => ({ status: 'ok', service: 'api' }),
  )

  app.get(
    '/ready',
    {
      schema: { tags: ['system'] },
    },
    async (_request, reply) => {
      const checks: Record<string, { ok: boolean; required: boolean; detail: string }> = {}
      try {
        await deps.checkDatabase()
        checks.database = { ok: true, required: true, detail: 'Database accepted a query' }
      } catch (error) {
        checks.database = {
          ok: false,
          required: true,
          detail: publicCheckDetail(error, 'Database check failed'),
        }
      }

      if (env.RATE_LIMIT_STORE === 'valkey') {
        try {
          await deps.checkValkey()
          checks.valkey = { ok: true, required: true, detail: 'Valkey responded to PING' }
        } catch (error) {
          checks.valkey = {
            ok: false,
            required: true,
            detail: publicCheckDetail(error, 'Valkey check failed'),
          }
        }
      } else {
        checks.valkey = {
          ok: false,
          required: false,
          detail: 'Rate limiting is using the in-process store. Valkey is not connected.',
        }
      }

      const ready = Object.values(checks).every((check) => check.ok || !check.required)
      return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks })
    },
  )

  app.get(
    '/api/v1',
    {
      schema: { tags: ['system'] },
    },
    async () => ({
      name: 'EraX API',
      version: '0.2.0',
      walletAuth: {
        siwe: siweStatus(),
        siws: siwsStatus(),
      },
      indexing: indexingStatus([...Object.keys(readers.evm), ...Object.keys(readers.solana)]),
    }),
  )

  const authLimit = {
    config: { rateLimit: { max: env.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '1 minute' } },
  }

  app.post('/api/v1/auth/register', authLimit, async (request, reply) => {
    const body = parse(registerBody, request.body)
    const result = await accounts.register({ ...body, ip: clientIp(request) })
    return reply.status(201).send(result)
  })

  app.post('/api/v1/auth/verify-email', authLimit, async (request) => {
    const body = parse(tokenBody, request.body)
    const user = await accounts.verifyEmail(body.token, clientIp(request))
    return { user }
  })

  app.post('/api/v1/auth/resend-verification', authLimit, async (request, reply) => {
    const body = parse(emailBody, request.body)
    await accounts.resendVerification(body.email, clientIp(request))
    return reply.status(202).send({
      message: 'If an unverified account exists, a verification message was created.',
    })
  })

  app.post('/api/v1/auth/login', authLimit, async (request, reply) => {
    const body = parse(loginBody, request.body)
    const result = await accounts.login({
      email: body.email,
      password: body.password,
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    })
    setSessionCookies(reply, result.sessionToken, result.csrfToken)
    return { user: result.user }
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const session = await requireSession(request, true)
    await accounts.logout(session.sessionId, session.user.id, clientIp(request))
    clearSessionCookies(reply)
    return { loggedOut: true }
  })

  app.get('/api/v1/auth/me', async (request) =>
    accounts.currentProfile((await requireSession(request, false)).user.id),
  )

  app.post('/api/v1/auth/forgot-password', authLimit, async (request, reply) => {
    const body = parse(emailBody, request.body)
    await accounts.requestPasswordReset(body.email, clientIp(request))
    return reply.status(202).send({
      message:
        env.EMAIL_MODE === 'outbox'
          ? 'If an account exists, a reset message was captured in the development outbox. No email was sent.'
          : 'If an account exists, a password reset message was sent.',
    })
  })

  app.post('/api/v1/auth/reset-password', authLimit, async (request, reply) => {
    const body = parse(resetBody, request.body)
    await accounts.resetPassword(body.token, body.password, clientIp(request))
    return reply.status(204).send()
  })

  registerWalletRoutes(app, {
    wallets: walletService,
    requireSession,
    parse,
    authLimit,
    setSessionCookies,
    clientIp,
  })

  app.patch('/api/v1/profile', authLimit, async (request) => {
    const session = await requireSession(request, true)
    const body = parse(profileBody, request.body)
    const profile = await accounts.updateProfile(session.user.id, body, clientIp(request))
    return { profile }
  })

  app.post('/api/v1/profile/avatar', authLimit, async (request) => {
    const session = await requireSession(request, true)
    const file = await request.file()
    if (!file) throw new ApiError(400, 'invalid_input', 'Choose an image file')
    const allowed: Record<string, '.png' | '.jpg' | '.webp' | '.gif'> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
    }
    const bytes = await file.toBuffer()
    const sniffed = sniffMedia(bytes)
    if (!sniffed || sniffed.kind !== 'image' || !allowed[sniffed.contentType]) {
      throw new ApiError(400, 'invalid_media', 'Avatar must be PNG, JPEG, WebP, or GIF')
    }
    return accounts.saveAvatar(session.user.id, bytes, sniffed.extension, clientIp(request))
  })

  const social = createSocialService({
    db: deps.db,
    media: deps.media,
    apiOrigin: env.API_PUBLIC_ORIGIN,
    now,
  })
  const product = createProductService(deps.db, now)
  const socialRoutes = registerSocialRoutes(app, {
    social,
    product,
    accounts,
    requireSession,
    parse,
    writeMax: deps.writeRateMax ?? (env.NODE_ENV === 'test' ? 10_000 : 60),
  })

  app.get('/api/v1/media/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*']
    if (!key) throw new ApiError(404, 'media_not_found', 'Media was not found')
    await social.authorizeMedia(key, await socialRoutes.optionalViewer(request))
    let stored
    try {
      stored = await deps.media.read(key)
    } catch {
      throw new ApiError(404, 'media_not_found', 'Media was not found')
    }
    if (!stored) throw new ApiError(404, 'media_not_found', 'Media was not found')
    return reply.type(stored.contentType).send(stored.bytes)
  })

  app.get('/api/v1/dev/outbox', async (request) => {
    if (env.NODE_ENV === 'production' || env.EMAIL_MODE !== 'outbox') {
      throw new ApiError(404, 'not_found', 'Not found')
    }
    const email =
      typeof request.query === 'object' && request.query && 'email' in request.query
        ? String((request.query as { email?: string }).email ?? '')
        : ''
    const records = await readOutbox(resolveRepoPath(env.EMAIL_OUTBOX_DIR))
    return {
      transport: 'development-outbox',
      delivered: false,
      messages: email ? records.filter((record) => record.to === email.toLowerCase()) : records,
    }
  })

  async function requireAdmin(request: FastifyRequest, requireCsrf: boolean) {
    const session = await requireSession(request, requireCsrf)
    if (session.user.role !== 'admin') {
      throw new ApiError(403, 'forbidden', 'Administrator access is required')
    }
    return session
  }

  app.get('/api/v1/admin/summary', async (request) => {
    await requireAdmin(request, false)
    return accounts.adminSummary()
  })

  app.get('/api/v1/admin/users', async (request) => {
    await requireAdmin(request, false)
    const query = request.query as { cursor?: string; limit?: string }
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100)
    return accounts.listUsers(query.cursor, limit)
  })

  app.post('/api/v1/admin/users/:id/status', async (request) => {
    const session = await requireAdmin(request, true)
    const body = parse(statusBody, request.body)
    const userId = (request.params as { id: string }).id
    const user = await accounts.setUserStatus(
      session.user.id,
      userId,
      body.status,
      clientIp(request),
    )
    return { user }
  })

  app.get('/api/v1/admin/audit-logs', async (request) => {
    await requireAdmin(request, false)
    const query = request.query as { cursor?: string; limit?: string }
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100)
    return accounts.listAudit(query.cursor, limit)
  })

  app.addHook('onClose', async () => {
    await deps.closeDb()
    if (deps.redis) deps.redis.disconnect()
  })

  return app
}
