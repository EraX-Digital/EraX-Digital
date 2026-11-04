import { randomUUID } from 'node:crypto'
import { hashPassword } from '@erax/auth'
import { profiles, users } from '@erax/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServer } from '../src/server'
import { parseEnv } from '@erax/config'
import { createTestApp, origin, sessionCookie } from './app'

let context: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  context = await createTestApp()
})

afterAll(async () => {
  await context.app.close()
})

async function verifiedUser(role: 'user' | 'admin' = 'user') {
  const email = `${role}-${randomUUID()}@example.com`
  const username = `${role.slice(0, 4)}_${randomUUID().slice(0, 8)}`
  const password = 'correct-horse-1'
  const passwordHash = await hashPassword(password)
  const inserted = await context.db
    .insert(users)
    .values({
      email,
      passwordHash,
      role,
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning()
  const user = inserted[0]
  if (!user) throw new Error('user missing')
  await context.db.insert(profiles).values({ userId: user.id, username, displayName: username })
  const loggedIn = await context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin },
    payload: { email, password },
  })
  return { user, email, username, ...sessionCookie(loggedIn.headers['set-cookie']) }
}

describe('authorization', () => {
  it('hides administration from ordinary users and records a suspension', async () => {
    const member = await verifiedUser('user')
    const admin = await verifiedUser('admin')

    const denied = await context.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { cookie: member.cookie },
    })
    expect(denied.statusCode).toBe(403)

    const listed = await context.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { cookie: admin.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().users.some((user: { email: string }) => user.email === member.email)).toBe(
      true,
    )

    const suspended = await context.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${member.user.id}/status`,
      headers: { origin, cookie: admin.cookie, 'x-erax-csrf': admin.csrf },
      payload: { status: 'suspended' },
    })
    expect(suspended.statusCode).toBe(200)

    const blocked = await context.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin },
      payload: { email: member.email, password: 'correct-horse-1' },
    })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().error.code).toBe('account_suspended')

    const self = await context.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${admin.user.id}/status`,
      headers: { origin, cookie: admin.cookie, 'x-erax-csrf': admin.csrf },
      payload: { status: 'suspended' },
    })
    expect(self.statusCode).toBe(400)

    const audit = await context.app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: { cookie: admin.cookie },
    })
    expect(audit.statusCode).toBe(200)
    expect(
      audit.json().entries.some((entry: { action: string }) => entry.action === 'user.suspended'),
    ).toBe(true)
  })

  it('updates a profile and stores an avatar on the filesystem', async () => {
    const member = await verifiedUser()
    const updated = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: { origin, cookie: member.cookie, 'x-erax-csrf': member.csrf },
      payload: { bio: 'Building in public', website: 'https://example.com/ada' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().profile.website).toBe('https://example.com/ada')

    const boundary = 'eraxboundary'
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const avatar = await context.app.inject({
      method: 'POST',
      url: '/api/v1/profile/avatar',
      headers: {
        origin,
        cookie: member.cookie,
        'x-erax-csrf': member.csrf,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    })
    expect(avatar.statusCode).toBe(200)
    const url = new URL(avatar.json().avatarUrl)
    const media = await context.app.inject({ method: 'GET', url: url.pathname })
    expect(media.statusCode).toBe(200)
    expect(media.headers['content-type']).toContain('image/png')
  })

  it('reports database and valkey failures without marking the process ready', async () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      WEB_ORIGIN: origin,
      ADMIN_ORIGIN: 'http://127.0.0.1:3001',
      API_PUBLIC_ORIGIN: 'http://127.0.0.1:4000',
      SESSION_COOKIE_SECRET: 'test-secret-that-is-at-least-32-characters',
      EMAIL_MODE: 'outbox',
      DATABASE_DRIVER: 'pglite',
      PGLITE_DIR: ':memory:',
      RATE_LIMIT_STORE: 'valkey',
      VALKEY_URL: 'redis://127.0.0.1:6399',
      ENABLE_API_DOCS: 'false',
    })
    const app = await buildServer({
      env,
      db: context.db,
      closeDb: async () => undefined,
      checkDatabase: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
      },
      checkValkey: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6399')
      },
      email: {
        async send() {
          throw new Error('unused')
        },
      },
      media: {
        driver: 'filesystem',
        async put() {
          return undefined
        },
        async read() {
          return null
        },
        async remove() {
          return undefined
        },
      },
    })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    expect(ready.statusCode).toBe(503)
    expect(ready.json().checks.database.ok).toBe(false)
    expect(ready.json().checks.valkey.ok).toBe(false)
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.json()).toEqual({ status: 'ok', service: 'api' })
    const description = await app.inject({ method: 'GET', url: '/api/v1' })
    expect(description.json().walletAuth.siwe.implemented).toBe(true)
    expect(description.json().walletAuth.siws.implemented).toBe(true)
    await app.close()
  })
})
