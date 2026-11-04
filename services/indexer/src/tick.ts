import { ERC20_TRANSFER_TOPIC, addressFromTopic, amountFromLogData, type IndexedEvmBlock } from '@erax/wallet-evm'
import { decodeSolanaProgramLogs } from '@erax/wallet-solana/creator-programs'
import { storeSolanaCreatorEvents } from './solana-events'
import {
  indexerCheckpoints,
  wallets,
  walletTransactions,
  type Database,
} from '@erax/database'
import { and, eq, sql } from 'drizzle-orm'

export type EvmIndexerReader = {
  getBlockNumber(): Promise<bigint>
  getBlock(number: bigint): Promise<IndexedEvmBlock>
}

export type SolanaIndexerReader = {
  getSlot(): Promise<number>
  getRecentSignatures(
    address: string,
  ): Promise<Array<{ signature: string; slot: number | null; err: boolean; blockTime: number | null }>>
  getParsedTransfers(
    signature: string,
  ): Promise<Array<{ program: string; type: string; info: Record<string, unknown> }> | null>
  getTransactionLogs?(signature: string): Promise<readonly string[] | null>
}

const REORG_DEPTH = 12n

export async function runEvmIndexerTick(options: {
  db: Database
  network: string
  reader: EvmIndexerReader
  maxBlocks?: number
}): Promise<{ action: 'started_at_head' | 'scanned' | 'reorg'; cursor: string; indexed: number }> {
  const head = await options.reader.getBlockNumber()
  const saved = await options.db
    .select()
    .from(indexerCheckpoints)
    .where(eq(indexerCheckpoints.network, options.network))
    .limit(1)
  const checkpoint = saved[0]
  if (!checkpoint) {
    const block = await options.reader.getBlock(head)
    if (block.number !== head || !block.hash) throw new Error('RPC block did not match the requested height')
    await options.db.insert(indexerCheckpoints).values({
      network: options.network,
      cursor: head.toString(),
      headHash: block.hash,
    })
    return { action: 'started_at_head', cursor: head.toString(), indexed: 0 }
  }
  let cursor = BigInt(checkpoint.cursor)
  let headHash = checkpoint.headHash
  let indexed = 0
  const watched = await watchedAddresses(options.db, 'evm', options.network)
  const limit = options.maxBlocks ?? 25
  for (let step = 0; step < limit && cursor < head; step += 1) {
    const next = cursor + 1n
    const block = await options.reader.getBlock(next)
    if (block.number !== next || !block.hash) throw new Error('RPC block did not match the requested height')
    if (headHash && block.parentHash.toLowerCase() !== headHash.toLowerCase()) {
      const rewound = cursor > REORG_DEPTH ? cursor - REORG_DEPTH : 0n
      await options.db
        .update(walletTransactions)
        .set({ status: 'dropped', updatedAt: new Date() })
        .where(
          and(
            eq(walletTransactions.network, options.network),
            sql`${walletTransactions.blockNumber} > ${rewound.toString()}::bigint`,
          ),
        )
      const anchor = rewound === 0n ? null : await options.reader.getBlock(rewound)
      await options.db
        .update(indexerCheckpoints)
        .set({ cursor: rewound.toString(), headHash: anchor?.hash ?? null, updatedAt: new Date() })
        .where(eq(indexerCheckpoints.network, options.network))
      return { action: 'reorg', cursor: rewound.toString(), indexed }
    }
    indexed += await storeEvmBlock(options.db, options.network, block, watched)
    cursor = next
    headHash = block.hash
    await options.db
      .update(indexerCheckpoints)
      .set({ cursor: cursor.toString(), headHash, updatedAt: new Date() })
      .where(eq(indexerCheckpoints.network, options.network))
  }
  return { action: 'scanned', cursor: cursor.toString(), indexed }
}

export async function runSolanaIndexerTick(options: {
  db: Database
  network: string
  reader: SolanaIndexerReader
}): Promise<{ action: 'started_at_head' | 'scanned'; cursor: string; indexed: number }> {
  const slot = await options.reader.getSlot()
  if (!Number.isInteger(slot) || slot < 0) throw new Error('RPC slot was not a usable number')
  const saved = await options.db
    .select()
    .from(indexerCheckpoints)
    .where(eq(indexerCheckpoints.network, options.network))
    .limit(1)
  if (!saved[0]) {
    await options.db.insert(indexerCheckpoints).values({
      network: options.network,
      cursor: String(slot),
      headHash: null,
    })
    return { action: 'started_at_head', cursor: String(slot), indexed: 0 }
  }
  const watched = await options.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.chainFamily, 'solana'), eq(wallets.network, options.network)))
  let indexed = 0
  for (const wallet of watched) {
    if (!wallet.verifiedAt || wallet.disconnectedAt) continue
    const signatures = await options.reader.getRecentSignatures(wallet.address)
    for (const signature of signatures) {
      if (signature.err) continue
      const parsed = await options.reader.getParsedTransfers(signature.signature)
      const transfer = parsed?.find((item) => item.program === 'system' && item.type === 'transfer')
      if (transfer) {
        const sender = String(transfer.info.source ?? '')
        const recipient = String(transfer.info.destination ?? '')
        if (sender === wallet.address || recipient === wallet.address) {
          const amount = BigInt(String(transfer.info.lamports ?? '0'))
          const inserted = await options.db
            .insert(walletTransactions)
            .values({
              userId: wallet.userId,
              walletId: wallet.id,
              network: options.network,
              hash: signature.signature,
              logIndex: -1,
              sender,
              recipient,
              assetSymbol: 'SOL',
              assetAddress: '',
              amountBaseUnits: amount.toString(),
              status: 'finalized',
              source: 'chain',
              blockNumber: signature.slot === null ? null : BigInt(signature.slot),
            })
            .onConflictDoNothing()
            .returning()
          if (inserted[0]) indexed += 1
        }
      }
      if (options.reader.getTransactionLogs) {
        const logs = await options.reader.getTransactionLogs(signature.signature)
        if (logs) {
          indexed += await storeSolanaCreatorEvents(options.db, {
            network: options.network,
            signature: signature.signature,
            slot: signature.slot,
            events: decodeSolanaProgramLogs(logs),
          })
        }
      }
    }
  }
  await options.db
    .update(indexerCheckpoints)
    .set({ cursor: String(slot), updatedAt: new Date() })
    .where(eq(indexerCheckpoints.network, options.network))
  return { action: 'scanned', cursor: String(slot), indexed }
}

async function watchedAddresses(db: Database, family: 'evm' | 'solana', network: string) {
  const rows = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.chainFamily, family), eq(wallets.network, network)))
  const map = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!row.verifiedAt || row.disconnectedAt) continue
    map.set(row.address.toLowerCase(), row)
  }
  return map
}

async function storeEvmBlock(
  db: Database,
  network: string,
  block: IndexedEvmBlock,
  watched: Map<string, { id: string; userId: string; address: string }>,
) {
  let indexed = 0
  for (const transaction of block.transactions) {
    const from = transaction.from.toLowerCase()
    const to = transaction.to?.toLowerCase() ?? ''
    const wallet = watched.get(from) ?? (to ? watched.get(to) : undefined)
    if (!wallet || transaction.value <= 0n) continue
    if (await insertChainTransaction(db, {
      userId: wallet.userId,
      walletId: wallet.id,
      network,
      hash: transaction.hash,
      logIndex: -1,
      sender: from,
      recipient: to,
      assetSymbol: 'ETH',
      assetAddress: '',
      amountBaseUnits: transaction.value.toString(),
      blockNumber: block.number,
    })) {
      indexed += 1
    }
  }
  for (const log of block.logs) {
    if ((log.topics[0] ?? '').toLowerCase() !== ERC20_TRANSFER_TOPIC) continue
    const sender = addressFromTopic(log.topics[1] ?? '')
    const recipient = addressFromTopic(log.topics[2] ?? '')
    const amount = amountFromLogData(log.data)
    if (!sender || !recipient || amount === null || log.logIndex < 0) continue
    const wallet = watched.get(sender) ?? watched.get(recipient)
    if (!wallet) continue
    if (await insertChainTransaction(db, {
      userId: wallet.userId,
      walletId: wallet.id,
      network,
      hash: log.transactionHash,
      logIndex: log.logIndex,
      sender,
      recipient,
      assetSymbol: 'ERC-20',
      assetAddress: log.address.toLowerCase(),
      amountBaseUnits: amount.toString(),
      blockNumber: block.number,
    })) {
      indexed += 1
    }
  }
  return indexed
}

async function insertChainTransaction(
  db: Database,
  value: {
    userId: string
    walletId: string
    network: string
    hash: string
    logIndex: number
    sender: string
    recipient: string
    assetSymbol: string
    assetAddress: string
    amountBaseUnits: string
    blockNumber: bigint
  },
) {
  const existing = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.network, value.network),
        eq(walletTransactions.hash, value.hash),
        eq(walletTransactions.logIndex, value.logIndex),
      ),
    )
    .limit(1)
  if (existing[0]?.status === 'dropped') {
    await db
      .update(walletTransactions)
      .set({ status: 'confirmed', blockNumber: value.blockNumber, updatedAt: new Date() })
      .where(eq(walletTransactions.id, existing[0].id))
    return false
  }
  if (existing[0]) return false
  await db.insert(walletTransactions).values({ ...value, status: 'confirmed', source: 'chain' })
  return true
}
