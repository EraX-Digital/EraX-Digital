import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { buildIndexer } from './server'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
const host = process.env.INDEXER_HOST?.trim() || '127.0.0.1'
const port = Number(process.env.INDEXER_PORT || 4001)
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('INDEXER_PORT must be a TCP port')
}
const app = buildIndexer()

const close = async () => {
  await app.close()
  process.exit(0)
}
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host, port })
