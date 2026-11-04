import { createDatabase, chainProgramEvents, indexerCheckpoints, migrateDatabase, profiles, users, wallets } from '@erax/database'
import { Keypair } from '@solana/web3.js'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anchorDiscriminator } from '@erax/wallet-solana/creator-programs'
import { storeSolanaCreatorEvents } from './solana-events'
import { runSolanaIndexerTick } from './tick'

describe('solana creator event storage', () => {
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
  })

  afterAll(async () => {
    await runtime.close()
  })

  it('stores a finalized tip once and ignores the duplicate', async () => {
    const sender = Keypair.generate().publicKey.toBase58()
    const creator = Keypair.generate().publicKey.toBase58()
    const payout = Keypair.generate().publicKey.toBase58()
    const event = {
      programId: Keypair.generate().publicKey.toBase58(),
      eventName: 'TipSent' as const,
      payload: { sender, creator, payout, amount: '250000', timestamp: '1700000000' },
    }
    const first = await storeSolanaCreatorEvents(runtime.db, {
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      signature: 'sig-1',
      slot: 42,
      events: [event],
    })
    const second = await storeSolanaCreatorEvents(runtime.db, {
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      signature: 'sig-1',
      slot: 42,
      events: [event],
    })
    expect(first).toBe(1)
    expect(second).toBe(0)
    const rows = await runtime.db
      .select()
      .from(chainProgramEvents)
      .where(eq(chainProgramEvents.signature, 'sig-1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('finalized')
    expect(rows[0]?.slot).toBe(42n)
    expect(anchorDiscriminator('event', 'TipSent')).toHaveLength(8)
  })

  it('indexes a finalized program log once and skips a failed signature', async () => {
    const network = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
    const address = Keypair.generate().publicKey.toBase58()
    const user = await runtime.db
      .insert(users)
      .values({ email: 'solana-indexer@example.com', passwordHash: 'hash-that-is-long-enough', role: 'user', status: 'active' })
      .returning()
    const created = user[0]
    if (!created) throw new Error('user missing')
    await runtime.db.insert(profiles).values({ userId: created.id, username: 'solanaindex', displayName: 'Solana' })
    await runtime.db.insert(wallets).values({
      userId: created.id,
      chainFamily: 'solana',
      network,
      address,
      verifiedAt: new Date(),
    })
    const sender = Keypair.generate().publicKey
    const creator = Keypair.generate().publicKey
    const payout = Keypair.generate().publicKey
    const rest = Buffer.alloc(16)
    rest.writeBigUInt64LE(250000n)
    rest.writeBigInt64LE(1_700_000_000n, 8)
    const body = Buffer.concat([
      anchorDiscriminator('event', 'TipSent'),
      sender.toBuffer(),
      creator.toBuffer(),
      payout.toBuffer(),
      rest,
    ])
    const logs = [`Program ${Keypair.generate().publicKey.toBase58()} invoke [1]`, `Program data: ${body.toString('base64')}`]
    const reader = {
      async getSlot() {
        return 90
      },
      async getRecentSignatures() {
        return [
          { signature: 'failed-sig', slot: 88, err: true, blockTime: 1 },
          { signature: 'tip-sig', slot: 89, err: false, blockTime: 2 },
        ]
      },
      async getTransactionLogs(signature: string) {
        return signature === 'tip-sig' ? logs : null
      },
      async getParsedTransfers() {
        return null
      },
    }
    const started = await runSolanaIndexerTick({ db: runtime.db, network, reader })
    expect(started.action).toBe('started_at_head')
    expect(started.indexed).toBe(0)
    const scanned = await runSolanaIndexerTick({ db: runtime.db, network, reader })
    const again = await runSolanaIndexerTick({ db: runtime.db, network, reader })
    expect(scanned).toEqual({ action: 'scanned', cursor: '90', indexed: 1 })
    expect(again.indexed).toBe(0)
    const rows = await runtime.db.select().from(chainProgramEvents).where(eq(chainProgramEvents.signature, 'tip-sig'))
    const failed = await runtime.db.select().from(chainProgramEvents).where(eq(chainProgramEvents.signature, 'failed-sig'))
    const checkpoint = await runtime.db.select().from(indexerCheckpoints).where(eq(indexerCheckpoints.network, network))
    expect(rows).toHaveLength(1)
    expect(failed).toHaveLength(0)
    expect(checkpoint[0]?.cursor).toBe('90')
  })
})