import { indexingStatus } from '@erax/blockchain-common'
import Fastify from 'fastify'

export function buildIndexer() {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' } })

  app.get('/health', async () => ({ status: 'ok', service: 'indexer' }))

  app.get('/ready', async () => ({
    status: 'ready',
    checks: {
      process: { ok: true, required: true, detail: 'Indexer process is accepting requests' },
    },
    indexing: indexingStatus(),
  }))

  return app
}
