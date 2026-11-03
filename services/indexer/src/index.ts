import { fileURLToPath } from 'node:url'
import { loadEnv } from '@erax/config'
import { config as loadDotenv } from 'dotenv'
import { buildIndexer } from './server'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
const env = loadEnv()
const app = buildIndexer()

const close = async () => {
  await app.close()
  process.exit(0)
}
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host: env.INDEXER_HOST, port: env.INDEXER_PORT })
