import {
  createDatabase,
  indexerCheckpoints,
  migrateDatabase,
  profiles,
  users,
  walletTransactions,
  wallets,
} from '@erax/database'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runEvmIndexerTick, type EvmIndexerReader } from './tick'
import type { IndexedEvmBlock } from '@erax/wallet-evm'

const blocks = new Map<bigint, IndexedEvmBlock>()

function block(number: bigint, hash: `0x${string}`, parentHash: `0x${string}`, value = 0n): IndexedEvmBlock {
  return {
    number,
    hash,
    parentHash,
    timestamp: 1,
    transactions:
      value > 0n
        ? [
            {
              hash: `0x${number.toString(16).padStart(64, '0')}` as `0x${string}`,
              from: '0x1111111111111111111111111111111111111111',
              to: '0x2222222222222222222222222222222222222222',
              value,
            },
          ]
        : [],
    logs: [],
  }
}

function reader(head: bigint): EvmIndexerReader {
  return {
    async getBlockNumber() {
      return head
    },
    async getBlock(number) {
      const found = blocks.get(number)
      if (!found) throw new Error('missing block')
      return found
    },
  }
}

describe('indexer checkpoints', () => {
  const runtimePromise = createDatabase({
    DATABASE_DRIVER: 'pglite',
    DATABASE_URL: '',
    PGLITE_DIR: ':memory:',
    DATABASE_POOL_MAX: 1,
    DATABASE_SSL: 'disable',
  })
  let runtime: Awaited<typeof runtimePromise>

  beforeAll(async () => {
    runtime = await runtimePromise
    await migrateDatabase(runtime)
    const user = await runtime.db
      .insert(users)
      .values({ email: 'indexer@example.com', passwordHash: 'hash-that-is-long-enough', role: 'user', status: 'active' })
      .returning()
    const created = user[0]
    if (!created) throw new Error('user missing')
    await runtime.db.insert(profiles).values({ userId: created.id, username: 'indexeruser', displayName: 'Indexer' })
    await runtime.db.insert(wallets).values({
      userId: created.id,
      chainFamily: 'evm',
      network: 'eip155:11155111',
      address: '0x1111111111111111111111111111111111111111',
      verifiedAt: new Date(),
    })
  })

  afterAll(async () => {
    await runtime.close()
  })

  it('starts at the head without backfilling, then resumes and rewinds a reorg', async () => {
    blocks.clear()
    blocks.set(2n, block(2n, `0x${'2'.repeat(64)}` as `0x${string}`, `0x${'1'.repeat(64)}` as `0x${string}`))
    const started = await runEvmIndexerTick({
      db: runtime.db,
      network: 'eip155:11155111',
      reader: reader(2n),
    })
    expect(started).toMatchObject({ action: 'started_at_head', cursor: '2', indexed: 0 })

    blocks.set(3n, block(3n, `0x${'3'.repeat(64)}` as `0x${string}`, `0x${'2'.repeat(64)}` as `0x${string}`, 5n))
    const scanned = await runEvmIndexerTick({
      db: runtime.db,
      network: 'eip155:11155111',
      reader: reader(3n),
    })
    expect(scanned).toMatchObject({ action: 'scanned', cursor: '3', indexed: 1 })
    const again = await runEvmIndexerTick({
      db: runtime.db,
      network: 'eip155:11155111',
      reader: reader(3n),
    })
    expect(again.indexed).toBe(0)
    const rows = await runtime.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.network, 'eip155:11155111'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.source).toBe('chain')
    expect(rows[0]?.status).toBe('confirmed')

    blocks.set(4n, block(4n, `0x${'4'.repeat(64)}` as `0x${string}`, `0x${'9'.repeat(64)}` as `0x${string}`, 9n))
    const reorg = await runEvmIndexerTick({
      db: runtime.db,
      network: 'eip155:11155111',
      reader: reader(4n),
    })
    expect(reorg.action).toBe('reorg')
    const checkpoint = await runtime.db
      .select()
      .from(indexerCheckpoints)
      .where(eq(indexerCheckpoints.network, 'eip155:11155111'))
    expect(checkpoint[0]?.cursor).toBe(reorg.cursor)
    const dropped = await runtime.db.select().from(walletTransactions)
    expect(dropped[0]?.status).toBe('dropped')
  })

  it('leaves the checkpoint unchanged when the RPC result fails', async () => {
    const before = await runtime.db
      .select()
      .from(indexerCheckpoints)
      .where(eq(indexerCheckpoints.network, 'eip155:11155111'))
    await expect(
      runEvmIndexerTick({
        db: runtime.db,
        network: 'eip155:11155111',
        reader: {
          async getBlockNumber() {
            throw new Error('429 rate limit')
          },
          async getBlock() {
            throw new Error('should not read a block')
          },
        },
      }),
    ).rejects.toThrow(/429/)
    const after = await runtime.db
      .select()
      .from(indexerCheckpoints)
      .where(eq(indexerCheckpoints.network, 'eip155:11155111'))
    expect(after[0]?.cursor).toBe(before[0]?.cursor)
  })
})
