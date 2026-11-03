import { describe, expect, it } from 'vitest'
import { parseEnv } from './index'

const base = {
  WEB_ORIGIN: 'http://127.0.0.1:3000',
  ADMIN_ORIGIN: 'http://127.0.0.1:3001',
  SESSION_COOKIE_SECRET: 'test-secret-that-is-at-least-32-characters',
  EMAIL_MODE: 'outbox',
  DATABASE_DRIVER: 'pglite',
  RATE_LIMIT_STORE: 'memory',
  NODE_ENV: 'test',
}

describe('parseEnv', () => {
  it('accepts a development configuration that does not pretend to send email', () => {
    const env = parseEnv(base)
    expect(env.EMAIL_MODE).toBe('outbox')
    expect(env.DATABASE_DRIVER).toBe('pglite')
    expect(env.RATE_LIMIT_STORE).toBe('memory')
  })

  it('rejects a short session secret', () => {
    expect(() => parseEnv({ ...base, SESSION_COOKIE_SECRET: 'too-short' })).toThrow(
      /SESSION_COOKIE_SECRET/,
    )
  })

  it('rejects the development outbox in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://erax:erax@localhost:5432/erax',
        RATE_LIMIT_STORE: 'valkey',
        VALKEY_URL: 'redis://127.0.0.1:6379',
        EMAIL_MODE: 'outbox',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow(/SMTP/)
  })
})
