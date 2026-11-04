import { SESSION_COOKIE } from '@erax/shared-types'
import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { assertNoWalletSecret } from '@erax/wallet-core'
import { ApiError } from './errors'
import type { createWalletService } from './wallets'

type WalletService = ReturnType<typeof createWalletService>

const challengeBody = z.object({
  address: z.string().min(32).max(64),
  network: z.string().min(3).max(80),
  purpose: z.enum(['sign-in', 'link']),
})

const verifyBody = z.object({
  message: z.string().min(20).max(2000),
  signature: z.string().min(10).max(200),
})

const previewBody = z.object({
  walletId: z.string().uuid(),
  recipient: z.string().min(32).max(64),
  assetAddress: z.string().max(64).default(''),
  amount: z.string().min(1).max(80),
})

const recordBody = z.object({
  walletId: z.string().uuid(),
  recipient: z.string().min(32).max(64),
  assetAddress: z.string().max(64).default(''),
  assetSymbol: z.string().min(1).max(32),
  amountBaseUnits: z.string().regex(/^[0-9]+$/),
  hash: z.string().min(32).max(128),
  feeBaseUnits: z.string().regex(/^[0-9]+$/).optional(),
})

export function registerWalletRoutes(
  app: FastifyInstance,
  options: {
    wallets: WalletService
    requireSession: (request: FastifyRequest, requireCsrf: boolean) => Promise<{ user: { id: string } }>
    parse: <T>(schema: z.ZodType<T>, value: unknown) => T
    authLimit: { config: { rateLimit: { max: number; timeWindow: string } } }
    setSessionCookies: (reply: FastifyReply, sessionToken: string, csrfToken: string) => void
    clientIp: (request: FastifyRequest) => string | null
  },
) {
  const { wallets, requireSession, parse, authLimit, setSessionCookies, clientIp } = options

  function rejectSecrets(body: unknown) {
    try {
      assertNoWalletSecret(body)
    } catch {
      throw new ApiError(400, 'wallet_secret_rejected', 'Wallet secret material is not accepted')
    }
  }

  async function sessionUser(request: FastifyRequest) {
    if (!request.cookies[SESSION_COOKIE]) return null
    return requireSession(request, true)
  }

  app.get('/api/v1/wallet/networks', async () => ({ networks: wallets.networks() }))
  app.get('/api/v1/wallet/assets', async () => ({
    assets: wallets.catalog(),
    valuation: 'unavailable',
  }))

  app.post('/api/v1/auth/siwe/challenge', authLimit, async (request) => {
    rejectSecrets(request.body)
    const body = parse(challengeBody, request.body)
    if (body.purpose === 'link') await sessionUser(request).then((session) => {
      if (!session) throw new ApiError(401, 'unauthenticated', 'Sign in before linking a wallet')
    })
    return wallets.createChallenge({ protocol: 'siwe', ...body })
  })

  app.post('/api/v1/auth/siws/challenge', authLimit, async (request) => {
    rejectSecrets(request.body)
    const body = parse(challengeBody, request.body)
    if (body.purpose === 'link') {
      const session = await sessionUser(request)
      if (!session) throw new ApiError(401, 'unauthenticated', 'Sign in before linking a wallet')
    }
    return wallets.createChallenge({ protocol: 'siws', ...body })
  })

  app.post('/api/v1/auth/siwe/verify', authLimit, async (request, reply) => {
    rejectSecrets(request.body)
    const body = parse(verifyBody, request.body)
    const session = await sessionUser(request)
    const result = await wallets.verify({
      protocol: 'siwe',
      message: body.message,
      signature: body.signature,
      sessionUserId: session?.user.id ?? null,
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    })
    if (result.session) setSessionCookies(reply, result.session.sessionToken, result.session.csrfToken)
    return { user: result.session?.user ?? null, walletId: result.walletId, linked: Boolean(session) }
  })

  app.post('/api/v1/auth/siws/verify', authLimit, async (request, reply) => {
    rejectSecrets(request.body)
    const body = parse(verifyBody, request.body)
    const session = await sessionUser(request)
    const result = await wallets.verify({
      protocol: 'siws',
      message: body.message,
      signature: body.signature,
      sessionUserId: session?.user.id ?? null,
      ip: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    })
    if (result.session) setSessionCookies(reply, result.session.sessionToken, result.session.csrfToken)
    return { user: result.session?.user ?? null, walletId: result.walletId, linked: Boolean(session) }
  })

  app.get('/api/v1/wallets', async (request) => {
    const session = await requireSession(request, false)
    return { wallets: await wallets.list(session.user.id) }
  })

  app.delete('/api/v1/wallets/:id', async (request) => {
    const session = await requireSession(request, true)
    const params = parse(z.object({ id: z.string().uuid() }), request.params)
    return wallets.disconnect(session.user.id, params.id, clientIp(request))
  })

  app.post('/api/v1/wallets/:id/preferred', async (request) => {
    const session = await requireSession(request, true)
    const params = parse(z.object({ id: z.string().uuid() }), request.params)
    return wallets.prefer(session.user.id, params.id)
  })

  app.get('/api/v1/wallets/:id/balances', async (request) => {
    const session = await requireSession(request, false)
    const params = parse(z.object({ id: z.string().uuid() }), request.params)
    const query = parse(
      z.object({ contract: z.string().optional() }),
      request.query ?? {},
    )
    return wallets.balances(session.user.id, params.id, query.contract)
  })

  app.post('/api/v1/wallets/:id/history/sync', async (request) => {
    const session = await requireSession(request, true)
    const params = parse(z.object({ id: z.string().uuid() }), request.params)
    return wallets.syncHistory(session.user.id, params.id)
  })

  app.post('/api/v1/wallets/transfers/preview', async (request) => {
    const session = await requireSession(request, true)
    rejectSecrets(request.body)
    const body = parse(previewBody, request.body)
    return wallets.preview(session.user.id, { ...body, assetAddress: body.assetAddress ?? '' })
  })

  app.post('/api/v1/wallets/transactions', async (request, reply) => {
    const session = await requireSession(request, true)
    rejectSecrets(request.body)
    const body = parse(recordBody, request.body)
    const recorded = await wallets.record(session.user.id, { ...body, assetAddress: body.assetAddress ?? '' })
    return reply.status(201).send(recorded)
  })

  app.get('/api/v1/wallets/transactions', async (request) => {
    const session = await requireSession(request, false)
    const query = parse(
      z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
      request.query ?? {},
    )
    return wallets.transactions(session.user.id, query.cursor, query.limit ?? 20)
  })

  app.post('/api/v1/wallets/transactions/:id/refresh', async (request) => {
    const session = await requireSession(request, true)
    const params = parse(z.object({ id: z.string().uuid() }), request.params)
    return wallets.refresh(session.user.id, params.id)
  })
}
