import { describe, expect, it } from 'vitest'
import { parseEnv, shouldAutoMigrate } from './index'

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

  it('accepts a production configuration and rejects local development shortcuts', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://erax:secret@ep-example.neon.tech/erax?sslmode=require',
      DATABASE_SSL: 'require',
      RATE_LIMIT_STORE: 'valkey',
      VALKEY_URL: 'rediss://default:secret@valkey.example:6379',
      EMAIL_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM: 'EraX <no-reply@erax.digital>',
      COOKIE_SECURE: 'true',
      WEB_ORIGIN: 'https://app.erax.digital',
      ADMIN_ORIGIN: 'https://admin.erax.digital',
      API_PUBLIC_ORIGIN: 'https://api.erax.digital',
      COOKIE_DOMAIN: '.erax.digital',
      MEDIA_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.example.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'erax-media',
      S3_ACCESS_KEY_ID: 'example-access-key',
      S3_SECRET_ACCESS_KEY: 'example-secret-key',
      ENABLE_API_DOCS: 'false',
      SESSION_COOKIE_SECRET: 'test-secret-that-is-at-least-32-characters',
    }
    const env = parseEnv(production)
    expect(env.MEDIA_DRIVER).toBe('s3')
    expect(env.DATABASE_SSL).toBe('require')
    expect(shouldAutoMigrate(env)).toBe(false)
    expect(() => parseEnv({ ...production, MEDIA_DRIVER: 'filesystem' })).toThrow(/object storage/)
    expect(() => parseEnv({ ...production, DATABASE_DRIVER: 'pglite' })).toThrow(/PostgreSQL/)
    expect(() => parseEnv({ ...production, RATE_LIMIT_STORE: 'memory' })).toThrow(/Valkey/)
  })
})
