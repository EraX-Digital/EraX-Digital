import { describe, expect, it } from 'vitest'
import { buildIndexer } from './server'

describe('indexer', () => {
  it('reports that no chain indexer is connected', async () => {
    const app = buildIndexer()
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toMatchObject({ status: 'ok', service: 'indexer' })

    const ready = await app.inject({ method: 'GET', url: '/ready' })
    expect(ready.statusCode).toBe(200)
    const body = ready.json()
    expect(body.indexing.state).toBe('not_configured')
    expect(
      body.indexing.networks.every(
        (network: { connected: boolean }) => network.connected === false,
      ),
    ).toBe(true)
    await app.close()
  })
})
