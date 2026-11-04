import { describe, expect, it } from 'vitest'
import { parseEnv } from '@erax/config'
import { deploymentOrigin, readDatabaseUrl, vercelConfigSource } from './vercel-handler'

describe('vercel account runtime', () => {
  it('reads the Vercel Postgres URL and builds a same-origin production config', () => {
    const source = {
      POSTGRES_URL: 'postgres://erax:secret@ep-example.neon.tech/erax?sslmode=require',
      VERCEL_PROJECT_PRODUCTION_URL: 'erax-digital.vercel.app',
      VERCEL_URL: 'erax-digital-abc.vercel.app',
    }
    expect(readDatabaseUrl(source)).toContain('neon.tech')
    expect(deploymentOrigin(source)).toBe('https://erax-digital.vercel.app')
    const env = parseEnv(vercelConfigSource(source, 'test-secret-that-is-at-least-32-characters'))
    expect(env.WEB_ORIGIN).toBe('https://erax-digital.vercel.app')
    expect(env.API_PUBLIC_ORIGIN).toBe(env.WEB_ORIGIN)
    expect(env.EMAIL_MODE).toBe('link')
    expect(env.RATE_LIMIT_STORE).toBe('memory')
    expect(env.MEDIA_DRIVER).toBe('none')
    expect(env.DATABASE_SSL).toBe('require')
  })

  it('does not treat an empty database URL as configured', () => {
    expect(readDatabaseUrl({})).toBe('')
    expect(readDatabaseUrl({ DATABASE_URL: 'not-a-database' })).toBe('')
  })
})
