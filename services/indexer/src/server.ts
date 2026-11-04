import { indexingStatus } from '@erax/blockchain-common'
import Fastify from 'fastify'

type Status = ReturnType<typeof indexingStatus>

export function buildIndexer(indexing: Status = indexingStatus()) {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' } })

  app.get('/health', async () => ({ status: 'ok', service: 'indexer' }))

  app.get('/ready', async () => ({
    status: 'ready',
    checks: {
      process: { ok: true, required: true, detail: 'Indexer process is accepting requests' },
    },
    indexing,
  }))

  return app
}
