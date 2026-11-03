import { fileURLToPath } from 'node:url'
import { loadEnv, resolveRepoPath } from '@erax/config'
import { createDatabase, migrateDatabase } from '@erax/database'
import { config as loadDotenv } from 'dotenv'
import { Redis } from 'ioredis'
import { createOutboxSender, createSmtpSender } from './email'
import { createFilesystemStorage } from './media'
import { buildServer } from './server'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const env = loadEnv()
const runtime = await createDatabase(env)
await migrateDatabase(runtime)

let redis: Redis | undefined
async function checkValkey() {
  if (!redis) throw new Error('Valkey client is not connected')
  const reply = await redis.ping()
  if (reply !== 'PONG') throw new Error(`Unexpected Valkey reply: ${reply}`)
}

if (env.RATE_LIMIT_STORE === 'valkey') {
  redis = new Redis(env.VALKEY_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    lazyConnect: true,
  })
  await redis.connect()
  await checkValkey()
}

const email =
  env.EMAIL_MODE === 'smtp'
    ? createSmtpSender({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        from: env.SMTP_FROM,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      })
    : createOutboxSender(resolveRepoPath(env.EMAIL_OUTBOX_DIR))

const app = await buildServer({
  env,
  db: runtime.db,
  closeDb: () => runtime.close(),
  checkDatabase: () => runtime.ping(),
  checkValkey,
  email,
  media: createFilesystemStorage(resolveRepoPath(env.MEDIA_ROOT)),
  redis,
})

const close = async () => {
  await app.close()
  process.exit(0)
}
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host: env.API_HOST, port: env.API_PORT })
