import { randomUUID } from 'node:crypto'
import { hashToken } from '@erax/auth'
import { sessions } from '@erax/database'
import { eq } from 'drizzle-orm'
import { readOutbox } from '../src/email'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, origin, sessionCookie } from './app'

const password = 'correct-horse-1'
let context: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  context = await createTestApp()
})

afterAll(async () => {
  await context.app.close()
})

async function register(username: string, email = `${username}@example.com`) {
  return context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin },
    payload: { email, password, username, displayName: username },
  })
}

async function tokenFor(email: string, purpose: string) {
  const messages = await readOutbox(context.outboxDir)
  const message = messages.find((item) => item.to === email && item.purpose === purpose)
  const match = message?.text.match(/token=([A-Za-z0-9_-]+)/)
  if (!match?.[1]) throw new Error(`No ${purpose} token for ${email}`)
  return match[1]
}

describe('authentication', () => {
  it('rejects invalid registration input and missing origin', async () => {
    const invalid = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin },
      payload: { email: 'not-an-email', password: 'x', username: 'ab' },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('invalid_input')

    const missingOrigin = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ada@example.com', password, username: 'ada_lovelace' },
    })
    expect(missingOrigin.statusCode).toBe(403)
    expect(missingOrigin.json().error.code).toBe('origin_rejected')
  })

  it('registers, blocks login until verification, then signs in and out', async () => {
    const email = `ada-${randomUUID()}@example.com`
    const username = `ada_${randomUUID().slice(0, 8)}`
    const created = await register(username, email)
    expect(created.statusCode).toBe(201)
    expect(created.json().emailDelivery).toMatchObject({
      delivered: false,
      transport: 'development-outbox',
    })

    const early = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password },
    })
    expect(early.statusCode).toBe(403)
    expect(early.json().error.code).toBe('email_not_verified')

    const token = await tokenFor(email, 'verify-email')
    const verified = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      headers: { origin },
      payload: { token },
    })
    expect(verified.statusCode).toBe(200)

    const replay = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      headers: { origin },
      payload: { token },
    })
    expect(replay.statusCode).toBe(400)

    const badLogin = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password: 'wrong-password-1' },
    })
    expect(badLogin.statusCode).toBe(401)

    const loggedIn = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password },
    })
    expect(loggedIn.statusCode).toBe(200)
    const cookies = sessionCookie(loggedIn.headers['set-cookie'])
    const me = await context.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookies.cookie },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().profile.username).toBe(username)

    const anonymous = await context.app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(anonymous.statusCode).toBe(401)

    const logout = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin, cookie: cookies.cookie, 'x-erax-csrf': cookies.csrf },
    })
    expect(logout.statusCode).toBe(200)
    const after = await context.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookies.cookie },
    })
    expect(after.statusCode).toBe(401)
  })

  it('resets a password and rejects an expired session', async () => {
    const email = `grace-${randomUUID()}@example.com`
    const username = `grace_${randomUUID().slice(0, 8)}`
    expect((await register(username, email)).statusCode).toBe(201)
    const verifyToken = await tokenFor(email, 'verify-email')
    await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      headers: { origin },
      payload: { token: verifyToken },
    })
    const loggedIn = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password },
    })
    const cookies = sessionCookie(loggedIn.headers['set-cookie'])

    const unknown = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin },
      payload: { email: 'missing@example.com' },
    })
    expect(unknown.statusCode).toBe(202)
    const before = (await readOutbox(context.outboxDir)).filter(
      (item) => item.to === 'missing@example.com',
    )
    expect(before).toHaveLength(0)

    const forgot = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin },
      payload: { email },
    })
    expect(forgot.json().message).toMatch(/was not sent|development outbox/)
    const resetToken = await tokenFor(email, 'reset-password')
    const reset = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin },
      payload: { token: resetToken, password: 'new-password-42' },
    })
    expect(reset.statusCode).toBe(204)

    const oldPassword = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password },
    })
    expect(oldPassword.statusCode).toBe(401)
    const expired = await context.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookies.cookie },
    })
    expect(expired.statusCode).toBe(401)

    const replacement = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email, password: 'new-password-42' },
    })
    expect(replacement.statusCode).toBe(200)
    const nextCookies = sessionCookie(replacement.headers['set-cookie'])
    const rawSession = nextCookies.cookie
      .split('; ')
      .find((item) => item.startsWith('erax_session='))
      ?.slice('erax_session='.length)
    if (!rawSession) throw new Error('expected a session cookie')
    await context.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(decodeURIComponent(rawSession))))
    const stale = await context.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: nextCookies.cookie },
    })
    expect(stale.statusCode).toBe(401)
  })

  it('does not authenticate a wallet address or a private key', async () => {
    const siwe = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siwe/verify',
      headers: { origin },
      payload: { address: '0x' + 'ab'.repeat(20), signature: '0xsig' },
    })
    expect(siwe.statusCode).toBe(501)
    expect(siwe.headers['set-cookie']).toBeUndefined()

    const secret = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/siws/verify',
      headers: { origin },
      payload: { privateKey: 'secret' },
    })
    expect(secret.statusCode).toBe(400)
    expect(secret.json().error.code).toBe('wallet_secret_rejected')
  })
})
