import { indexingStatus, networks, resolveRpcUrl } from '@erax/blockchain-common'
import { createDatabase, migrateDatabase } from '@erax/database'
import { createViemIndexerReader } from '@erax/wallet-evm'
import { createSolanaIndexerReader } from '@erax/wallet-solana'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { buildIndexer } from './server'
import { runEvmIndexerTick, runSolanaIndexerTick } from './tick'

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const host = process.env.INDEXER_HOST?.trim() || '127.0.0.1'
const port = Number(process.env.INDEXER_PORT || 4001)
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('INDEXER_PORT must be a TCP port')
}

const nodeEnv = process.env.NODE_ENV?.trim() || 'development'
const configured = networks.flatMap((network) => {
  const resolved = resolveRpcUrl(network, process.env, nodeEnv)
  return resolved.url ? [{ network, url: resolved.url }] : []
})

const app = buildIndexer(indexingStatus(configured.map((item) => item.network.caip2)))

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'indexer tick failed'
  return message.replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 300)
}

async function database() {
  const driver = process.env.DATABASE_DRIVER === 'pglite' ? 'pglite' : 'postgres'
  if (driver === 'postgres' && !process.env.DATABASE_URL?.startsWith('postgres')) return null
  try {
    const runtime = await createDatabase({
      DATABASE_DRIVER: driver,
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      PGLITE_DIR: process.env.PGLITE_DIR || './var/pglite',
      DATABASE_POOL_MAX: 2,
      DATABASE_SSL: process.env.DATABASE_SSL === 'require' ? 'require' : 'disable',
    })
    await migrateDatabase(runtime)
    return runtime
  } catch (error) {
    app.log.error({ message: safeMessage(error) }, 'indexer database is not available; checkpoints were not advanced')
    return null
  }
}

const runtime = await database()
let timer: ReturnType<typeof setInterval> | undefined

if (runtime && configured.length > 0) {
  const tick = async () => {
    for (const item of configured) {
      try {
        if (item.network.family === 'evm' && item.network.chainId !== null) {
          const result = await runEvmIndexerTick({
            db: runtime.db,
            network: item.network.caip2,
            reader: createViemIndexerReader(item.url, item.network.chainId),
          })
          app.log.info(
            { network: item.network.caip2, action: result.action, cursor: result.cursor, indexed: result.indexed },
            'evm tick',
          )
        }
        if (item.network.family === 'solana') {
          const result = await runSolanaIndexerTick({
            db: runtime.db,
            network: item.network.caip2,
            reader: createSolanaIndexerReader(item.url),
          })
          app.log.info(
            { network: item.network.caip2, action: result.action, cursor: result.cursor, indexed: result.indexed },
            'solana tick',
          )
        }
      } catch (error) {
        app.log.error({ network: item.network.caip2, message: safeMessage(error) }, 'indexer tick failed')
      }
    }
  }
  void tick()
  timer = setInterval(() => void tick(), 20_000)
  timer.unref()
} else {
  app.log.info(
    { rpcConfigured: configured.length, database: Boolean(runtime) },
    'indexer is not scanning because the database or an RPC URL is not configured',
  )
}

const close = async () => {
  if (timer) clearInterval(timer)
  await app.close()
  await runtime?.close()
  process.exit(0)
}

process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host, port })
