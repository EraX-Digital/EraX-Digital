import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseEnv } from '@erax/config'
import { createDatabase, migrateDatabase } from '@erax/database'
import { createOutboxSender } from '../src/email'
import { createFilesystemStorage } from '../src/media'
import type { ChainReaders } from '../src/chain-readers'
import { buildServer } from '../src/server'

export const origin = 'http://127.0.0.1:3000'

export async function createTestApp(options?: { writeRateMax?: number; chainReaders?: ChainReaders }) {
  const outboxDir = await mkdtemp(path.join(tmpdir(), 'erax-outbox-'))
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'erax-media-'))
  const env = parseEnv({
    NODE_ENV: 'test',
    WEB_ORIGIN: origin,
    ADMIN_ORIGIN: 'http://127.0.0.1:3001',
    API_PUBLIC_ORIGIN: 'http://127.0.0.1:4000',
    SESSION_COOKIE_SECRET: 'test-secret-that-is-at-least-32-characters',
    EMAIL_MODE: 'outbox',
    EMAIL_OUTBOX_DIR: outboxDir,
    DATABASE_DRIVER: 'pglite',
    PGLITE_DIR: ':memory:',
    RATE_LIMIT_STORE: 'memory',
    ENABLE_API_DOCS: 'false',
    COOKIE_SECURE: 'false',
  })
  const runtime = await createDatabase(env)
  await migrateDatabase(runtime)
  const app = await buildServer({
    env,
    db: runtime.db,
    closeDb: () => runtime.close(),
    checkDatabase: () => runtime.ping(),
    checkValkey: async () => {
      throw new Error('Valkey is not connected')
    },
    email: createOutboxSender(outboxDir),
    media: createFilesystemStorage(mediaRoot),
    writeRateMax: options?.writeRateMax,
    chainReaders: options?.chainReaders,
  })
  return { app, db: runtime.db, env, outboxDir }
}

export function sessionCookie(setCookie: string | string[] | undefined): {
  cookie: string
  csrf: string
} {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  const cookie = list.map((item) => item.split(';')[0]).join('; ')
  const csrfPair = list
    .map((item) => item.split(';')[0] ?? '')
    .find((item) => item.startsWith('erax_csrf='))
  const csrf = csrfPair ? decodeURIComponent(csrfPair.slice('erax_csrf='.length)) : ''
  return { cookie, csrf }
}
