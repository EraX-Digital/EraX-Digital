import { randomBytes } from 'node:crypto'
import { validateUsername } from '@erax/auth'
import {
  evmNetworkByChainId,
  explorerUrl,
  findTrustedAsset,
  networkByCaip2,
  networks,
  trustedAssets,
  type TrustedAsset,
} from '@erax/blockchain-common'
import {
  auditLogs,
  authChallenges,
  profiles,
  users,
  walletAuthEvents,
  walletPreferences,
  wallets,
  walletTransactions,
  transactionStatusUpdates,
  type Database,
} from '@erax/database'
import type { PublicUser } from '@erax/shared-types'
import { formatBaseUnits, parseBaseUnits, parseDecimalToBaseUnits, sanitizeTokenLabel } from '@erax/wallet-core'
import {
  buildErc20Transfer,
  buildEthTransfer,
  buildSiweMessage,
  evmTransactionMatches,
  isEvmAddress,
  normalizeEvmAddress,
  parseSiweMessage,
  verifyEvmSignature,
  type EvmReader,
} from '@erax/wallet-evm'
import {
  buildSiwsMessage,
  buildSolTransfer,
  buildSplTransfer,
  decodeSolanaSignature,
  isSolanaAddress,
  parseSiwsMessage,
  solanaTransferMatches,
  verifySolanaSignature,
  type SolanaReader,
} from '@erax/wallet-solana'
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { ApiError } from './errors'

const CHALLENGE_MS = 10 * 60 * 1000
const HISTORY_COVERAGE =
  'This list contains transfers submitted in EraX and transactions stored by the indexer or a bounded Solana signature request. It is not a complete wallet history.'

type OpenSession = (
  userId: string,
  ip: string | null,
  userAgent: string | null,
) => Promise<{ user: PublicUser; sessionToken: string; csrfToken: string }>

export type WalletServiceOptions = {
  db: Database
  webOrigin: string
  now: () => Date
  trustedTokenJson: string
  evmReaders: Record<string, EvmReader>
  solanaReaders: Record<string, SolanaReader>
  openSession: OpenSession
}

type AssetChoice = {
  symbol: string
  name: string
  assetAddress: string
  decimals: number
  verified: boolean
  tokenProgram: 'spl' | 'token2022' | null
}

export function createWalletService(options: WalletServiceOptions) {
  const { db, now } = options
  const domain = new URL(options.webOrigin).host
  let assetsCache: TrustedAsset[] | undefined

  function assets(): TrustedAsset[] {
    if (!assetsCache) assetsCache = trustedAssets(options.trustedTokenJson)
    return assetsCache
  }

  function requireNetwork(caip2: string) {
    const network = networkByCaip2(caip2)
    if (!network) throw new ApiError(400, 'unknown_network', 'That network is not supported')
    return network
  }

  function rpcError(error: unknown): never {
    if (error instanceof Error && error.name === 'ChainRpcError') {
      throw new ApiError(502, 'chain_rpc_failed', error.message)
    }
    throw error
  }

  async function ownedWallet(userId: string, walletId: string, activeOnly: boolean) {
    const found = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .limit(1)
    const wallet = found[0]
    if (!wallet || !wallet.verifiedAt) throw new ApiError(404, 'wallet_not_found', 'Wallet was not found')
    if (activeOnly && wallet.disconnectedAt) {
      throw new ApiError(409, 'wallet_disconnected', 'Reconnect this wallet before using it')
    }
    return wallet
  }

  async function writeStatus(transactionId: string, status: string, detail: string) {
    await db.insert(transactionStatusUpdates).values({ transactionId, status, detail })
  }

  return {
    networks() {
      return networks.map((network) => ({
        family: network.family,
        caip2: network.caip2,
        name: network.name,
        chainId: network.chainId,
        nativeSymbol: network.nativeSymbol,
        nativeDecimals: network.nativeDecimals,
        environment: network.environment,
        rpcConfigured:
          network.family === 'evm'
            ? Boolean(options.evmReaders[network.caip2])
            : Boolean(options.solanaReaders[network.caip2]),
      }))
    },

    catalog() {
      return assets().map((asset) => ({ ...asset, verified: true }))
    },

    async createChallenge(input: {
      protocol: 'siwe' | 'siws'
      address: string
      network: string
      purpose: 'sign-in' | 'link'
    }) {
      const network = requireNetwork(input.network)
      if (input.protocol === 'siwe' && network.family !== 'evm') {
        throw new ApiError(400, 'wrong_network', 'SIWE requires an EVM network')
      }
      if (input.protocol === 'siws' && network.family !== 'solana') {
        throw new ApiError(400, 'wrong_network', 'SIWS requires a Solana network')
      }
      const address =
        input.protocol === 'siwe' ? normalizeAddress(input.protocol, input.address) : input.address
      if (input.protocol === 'siws' && !isSolanaAddress(address)) {
        throw new ApiError(400, 'invalid_address', 'That Solana address is not valid')
      }
      const nonce = randomBytes(16).toString('hex')
      const issuedAt = now().toISOString()
      const expiresAt = new Date(now().getTime() + CHALLENGE_MS)
      const statement =
        input.purpose === 'link' ? 'Link this wallet to your EraX account.' : 'Sign in to EraX.'
      const message =
        input.protocol === 'siwe'
          ? buildSiweMessage({
              domain,
              address,
              statement,
              uri: options.webOrigin,
              version: '1',
              chainId: network.chainId ?? 0,
              nonce,
              issuedAt,
              expirationTime: expiresAt.toISOString(),
            })
          : buildSiwsMessage({
              domain,
              address,
              statement,
              uri: options.webOrigin,
              version: '1',
              chainId: network.caip2,
              nonce,
              issuedAt,
              expirationTime: expiresAt.toISOString(),
            })
      await db.insert(authChallenges).values({
        protocol: input.protocol,
        address: input.protocol === 'siwe' ? address.toLowerCase() : address,
        network: network.caip2,
        domain,
        nonce,
        message,
        expiresAt,
      })
      return { message, nonce, expiresAt: expiresAt.toISOString(), network: network.caip2 }
    },

    async verify(input: {
      protocol: 'siwe' | 'siws'
      message: string
      signature: string
      sessionUserId: string | null
      ip: string | null
      userAgent: string | null
    }) {
      const message =
        input.protocol === 'siwe' ? safeParseSiwe(input.message) : safeParseSiws(input.message)
      if (message.domain !== domain || message.uri !== options.webOrigin) {
        throw new ApiError(401, 'wallet_challenge_invalid', 'The signature domain does not match EraX')
      }
      if (input.sessionUserId && message.statement !== 'Link this wallet to your EraX account.') {
        throw new ApiError(400, 'statement_mismatch', 'Linking requires the wallet-link message')
      }
      if (!input.sessionUserId && message.statement !== 'Sign in to EraX.') {
        throw new ApiError(400, 'statement_mismatch', 'Sign-in requires the sign-in message')
      }
      const network =
        input.protocol === 'siwe' && typeof message.chainId === 'number'
          ? evmNetworkByChainId(message.chainId)
          : typeof message.chainId === 'string'
            ? networkByCaip2(message.chainId)
            : null
      if (!network || (input.protocol === 'siwe' && network.family !== 'evm')) {
        throw new ApiError(400, 'wrong_network', 'That chain is not supported')
      }
      if (input.protocol === 'siws' && network.caip2 !== message.chainId) {
        throw new ApiError(400, 'wrong_network', 'That Solana cluster is not supported')
      }
      const address = input.protocol === 'siwe' ? message.address.toLowerCase() : message.address
      const parsed = message
      const issued = new Date(parsed.issuedAt)
      if (issued.getTime() > now().getTime() + 60_000 || issued.getTime() < now().getTime() - CHALLENGE_MS) {
        throw new ApiError(401, 'wallet_challenge_invalid', 'The signature time is outside the allowed window')
      }
      const challengeRows = await db
        .select()
        .from(authChallenges)
        .where(eq(authChallenges.nonce, parsed.nonce))
        .limit(1)
      const challenge = challengeRows[0]
      if (
        !challenge ||
        challenge.protocol !== input.protocol ||
        challenge.message !== input.message ||
        challenge.address !== address ||
        challenge.domain !== domain ||
        challenge.network !== network.caip2 ||
        challenge.consumedAt ||
        challenge.expiresAt <= now()
      ) {
        throw new ApiError(401, 'wallet_challenge_invalid', 'This wallet challenge is invalid or expired')
      }
      const consumed = await db
        .update(authChallenges)
        .set({ consumedAt: now() })
        .where(and(eq(authChallenges.id, challenge.id), isNull(authChallenges.consumedAt)))
        .returning()
      if (!consumed[0]) {
        throw new ApiError(401, 'wallet_challenge_reused', 'This wallet challenge was already used')
      }
      const verified =
        input.protocol === 'siwe'
          ? await verifySiwe(address, input.message, input.signature, options.evmReaders[network.caip2])
          : verifySiws(address, input.message, input.signature)
      if (!verified.ok) {
        await db.insert(walletAuthEvents).values({
          protocol: input.protocol,
          address,
          network: network.caip2,
          userId: input.sessionUserId,
          result: 'failed',
        })
        throw new ApiError(401, 'wallet_signature_invalid', verified.reason)
      }
      const linked = await linkWallet({
        db,
        now,
        userId: input.sessionUserId,
        family: network.family,
        network: network.caip2,
        address,
        openSession: options.openSession,
        ip: input.ip,
        userAgent: input.userAgent,
      })
      await db.insert(walletAuthEvents).values({
        protocol: input.protocol,
        address,
        network: network.caip2,
        userId: linked.userId,
        result: 'succeeded',
      })
      await db.insert(auditLogs).values({
        actorUserId: linked.userId,
        action: input.sessionUserId ? 'wallet.linked' : 'wallet.authenticated',
        targetType: 'wallet',
        targetId: linked.walletId,
        metadata: { network: network.caip2, method: verified.method },
        ip: input.ip,
      })
      return linked
    },

    async list(userId: string) {
      const rows = await db.select().from(wallets).where(eq(wallets.userId, userId))
      return rows.map((wallet) => presentWallet(wallet))
    },

    async disconnect(userId: string, walletId: string, ip: string | null) {
      const wallet = await ownedWallet(userId, walletId, false)
      await db.transaction(async (tx) => {
        await tx
          .update(wallets)
          .set({ disconnectedAt: now(), preferred: false, updatedAt: now() })
          .where(eq(wallets.id, wallet.id))
        await tx
          .update(walletPreferences)
          .set({ preferredWalletId: null, updatedAt: now() })
          .where(eq(walletPreferences.preferredWalletId, wallet.id))
        await tx.insert(auditLogs).values({
          actorUserId: userId,
          action: 'wallet.disconnected',
          targetType: 'wallet',
          targetId: wallet.id,
          metadata: { network: wallet.network },
          ip,
        })
      })
      return { disconnected: true }
    },

    async prefer(userId: string, walletId: string) {
      const wallet = await ownedWallet(userId, walletId, true)
      await db.transaction(async (tx) => {
        await tx.update(wallets).set({ preferred: false, updatedAt: now() }).where(eq(wallets.userId, userId))
        await tx.update(wallets).set({ preferred: true, updatedAt: now() }).where(eq(wallets.id, wallet.id))
        await tx
          .insert(walletPreferences)
          .values({ userId, preferredWalletId: wallet.id, updatedAt: now() })
          .onConflictDoUpdate({
            target: walletPreferences.userId,
            set: { preferredWalletId: wallet.id, updatedAt: now() },
          })
      })
      return { preferredWalletId: wallet.id }
    },

    async balances(userId: string, walletId: string, extraContract?: string) {
      const wallet = await ownedWallet(userId, walletId, true)
      const network = requireNetwork(wallet.network)
      const rows = []
      if (network.family === 'evm') {
        const reader = options.evmReaders[network.caip2]
        if (!reader) throw new ApiError(503, 'chain_rpc_not_configured', rpcMissing(network.name))
        let native: bigint
        try {
          native = await reader.getNativeBalance(wallet.address)
        } catch (error) {
          rpcError(error)
        }
        rows.push(balanceRow(network.caip2, '', network.nativeSymbol, network.nativeName, native, network.nativeDecimals, true))
        const tokens = assets().filter((asset) => asset.network === network.caip2 && asset.kind === 'erc20')
        for (const token of tokens) {
          rows.push(await erc20Balance(reader, wallet.address, network.caip2, token))
        }
        if (extraContract) {
          if (!isEvmAddress(extraContract)) throw new ApiError(400, 'invalid_address', 'Token address is invalid')
          const known = findTrustedAsset(assets(), network.caip2, extraContract)
          if (!known) rows.push(await erc20Balance(reader, wallet.address, network.caip2, null, extraContract))
        }
      } else {
        const reader = options.solanaReaders[network.caip2]
        if (!reader) throw new ApiError(503, 'chain_rpc_not_configured', rpcMissing(network.name))
        let native: bigint
        try {
          native = await reader.getNativeBalance(wallet.address)
        } catch (error) {
          rpcError(error)
        }
        rows.push(balanceRow(network.caip2, '', network.nativeSymbol, network.nativeName, native, network.nativeDecimals, true))
        try {
          const tokens = await reader.getTokenAccounts(wallet.address)
          for (const token of tokens) {
            const trusted = findTrustedAsset(assets(), network.caip2, token.mint)
            const decimalsAgree = !trusted || trusted.decimals === token.decimals
            rows.push(
              balanceRow(
                network.caip2,
                token.mint,
                trusted && decimalsAgree ? trusted.symbol : null,
                trusted && decimalsAgree ? trusted.name : null,
                token.amount,
                token.decimals,
                Boolean(trusted && decimalsAgree),
              ),
            )
          }
        } catch (error) {
          rpcError(error)
        }
      }
      return { network: network.caip2, address: wallet.address, balances: rows, valuation: 'unavailable' as const }
    },

    async preview(userId: string, input: {
      walletId: string
      recipient: string
      assetAddress: string
      amount: string
    }) {
      const wallet = await ownedWallet(userId, input.walletId, true)
      const network = requireNetwork(wallet.network)
      const asset = await resolveAsset(options, assets(), network.caip2, input.assetAddress, wallet.address)
      let amount: bigint
      try {
        amount = parseDecimalToBaseUnits(input.amount, asset.decimals)
      } catch (error) {
        throw new ApiError(400, 'invalid_amount', error instanceof Error ? error.message : 'Amount is invalid')
      }
      if (amount <= 0n) throw new ApiError(400, 'invalid_amount', 'Amount must be greater than zero')
      const recipient = normalizeRecipient(network.family, input.recipient)
      if (network.family === 'evm') {
        const transaction = asset.assetAddress
          ? buildErc20Transfer({ chainId: network.chainId ?? 0, token: asset.assetAddress, to: recipient, amountBaseUnits: amount })
          : buildEthTransfer({ chainId: network.chainId ?? 0, to: recipient, amountBaseUnits: amount })
        const reader = options.evmReaders[network.caip2]
        const fee = reader ? await feeOrThrow(() => reader.estimateFee({ ...transaction, from: wallet.address })) : null
        if (reader) await assertEvmFunds(reader, wallet.address, asset, amount, fee)
        return previewBody(network.caip2, wallet.address, recipient, asset, amount, fee, {
          chainId: transaction.chainId,
          to: transaction.to,
          value: transaction.value.toString(),
          data: transaction.data,
        })
      }
      const instructions =
        asset.assetAddress.length === 0
          ? buildSolTransfer({ from: wallet.address, to: recipient, amountBaseUnits: amount })
          : buildSplTransfer({
              from: wallet.address,
              to: recipient,
              mint: asset.assetAddress,
              amountBaseUnits: amount,
              tokenProgram: asset.tokenProgram ?? 'spl',
            })
      const reader = options.solanaReaders[network.caip2]
      const fee = reader ? await feeOrThrow(() => reader.estimateFee(wallet.address, instructions)) : null
      if (reader) await assertSolanaFunds(reader, wallet.address, asset, amount, fee)
      return previewBody(network.caip2, wallet.address, recipient, asset, amount, fee, { instructions })
    },

    async record(userId: string, input: {
      walletId: string
      recipient: string
      assetAddress: string
      assetSymbol: string
      amountBaseUnits: string
      hash: string
      feeBaseUnits?: string | undefined
    }) {
      const wallet = await ownedWallet(userId, input.walletId, true)
      const network = requireNetwork(wallet.network)
      const amount = parseBaseUnits(input.amountBaseUnits)
      if (amount <= 0n) throw new ApiError(400, 'invalid_amount', 'Amount must be greater than zero')
      const recipient = normalizeRecipient(network.family, input.recipient)
      if (!validHash(network.family, input.hash)) throw new ApiError(400, 'invalid_hash', 'Transaction hash is invalid')
      const fee = input.feeBaseUnits ? parseBaseUnits(input.feeBaseUnits).toString() : null
      const inserted = await db
        .insert(walletTransactions)
        .values({
          userId,
          walletId: wallet.id,
          network: network.caip2,
          hash: input.hash,
          logIndex: -1,
          sender: wallet.address,
          recipient,
          assetSymbol: sanitizeTokenLabel(input.assetSymbol),
          assetAddress: network.family === 'evm' ? input.assetAddress.toLowerCase() : input.assetAddress,
          amountBaseUnits: amount.toString(),
          feeBaseUnits: fee,
          status: 'pending',
          source: 'erax',
        })
        .onConflictDoNothing()
        .returning()
      const row = inserted[0] ?? (await existingTransaction(db, network.caip2, input.hash))
      if (!row) throw new ApiError(409, 'duplicate_transaction', 'That transaction is already recorded')
      if (inserted[0]) await writeStatus(row.id, 'pending', 'Submitted by the wallet. Confirmation has not been read.')
      return { transaction: presentTransaction(row), confirmed: false }
    },

    async transactions(userId: string, cursorValue: string | undefined, limit: number) {
      const owned = await db.select().from(wallets).where(eq(wallets.userId, userId))
      const addresses = owned.map((wallet) => wallet.address)
      if (addresses.length === 0) {
        return { transactions: [], nextCursor: null, coverage: HISTORY_COVERAGE }
      }
      const cursor = cursorValue ? decodeCursor(cursorValue) : null
      const pageFilter = cursor
        ? or(
            lt(walletTransactions.createdAt, new Date(cursor.createdAt)),
            and(eq(walletTransactions.createdAt, new Date(cursor.createdAt)), lt(walletTransactions.id, cursor.id)),
          )
        : undefined
      const addressFilter = or(
        inArray(walletTransactions.sender, addresses),
        inArray(walletTransactions.recipient, addresses),
      )
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(pageFilter ? and(addressFilter, pageFilter) : addressFilter)
        .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const last = page[page.length - 1]
      return {
        transactions: page.map(presentTransaction),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
        coverage: HISTORY_COVERAGE,
      }
    },

    async refresh(userId: string, transactionId: string) {
      const found = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, transactionId))
        .limit(1)
      const row = found[0]
      if (!row) throw new ApiError(404, 'transaction_not_found', 'Transaction was not found')
      const owned = await db.select().from(wallets).where(eq(wallets.userId, userId))
      const addresses = new Set(owned.map((wallet) => wallet.address))
      if (!addresses.has(row.sender) && !addresses.has(row.recipient)) {
        throw new ApiError(404, 'transaction_not_found', 'Transaction was not found')
      }
      const network = requireNetwork(row.network)
      let next = row.status
      let detail = 'No receipt was found. The transaction stays pending.'
      let fee = row.feeBaseUnits
      let blockNumber = row.blockNumber
      if (network.family === 'evm') {
        const reader = options.evmReaders[network.caip2]
        if (!reader) {
          return { transaction: presentTransaction(row), confirmation: 'rpc_not_configured' as const }
        }
        try {
          const receipt = await reader.getReceipt(row.hash)
          if (!receipt) {
            next = 'pending'
          } else if (receipt.status === 'reverted') {
            next = 'reverted'
            detail = 'The chain receipt status is reverted.'
            fee = receipt.feeBaseUnits
            blockNumber = receipt.blockNumber
          } else {
            const transaction = await reader.getTransaction(row.hash)
            const matched =
              transaction !== null &&
              evmTransactionMatches(transaction, {
                sender: row.sender,
                recipient: row.recipient,
                amountBaseUnits: BigInt(row.amountBaseUnits),
                assetAddress: row.assetAddress,
              })
            next = matched ? 'confirmed' : 'failed'
            detail = matched
              ? 'The chain receipt matched the recorded transfer.'
              : 'The chain transaction did not match the recorded sender, recipient, asset, or amount.'
            fee = receipt.feeBaseUnits
            blockNumber = receipt.blockNumber
          }
        } catch (error) {
          rpcError(error)
        }
      } else {
        const reader = options.solanaReaders[network.caip2]
        if (!reader) {
          return { transaction: presentTransaction(row), confirmation: 'rpc_not_configured' as const }
        }
        try {
          const status = await reader.getSignatureStatus(row.hash)
          if (status === 'failed') {
            next = 'failed'
            detail = 'The Solana cluster reported an error for this signature.'
          } else if (status !== 'finalized') {
            next = 'pending'
            detail = 'The signature is not finalized.'
          } else {
            const instructions = await reader.getParsedTransfers(row.hash)
            const matched =
              instructions !== null &&
              solanaTransferMatches(instructions, {
                sender: row.sender,
                recipient: row.recipient,
                amountBaseUnits: BigInt(row.amountBaseUnits),
                assetAddress: row.assetAddress,
              })
            next = matched ? 'finalized' : 'failed'
            detail = matched
              ? 'The finalized transaction matched the recorded transfer.'
              : 'The finalized transaction did not match the recorded transfer.'
          }
        } catch (error) {
          rpcError(error)
        }
      }
      if (next !== row.status || fee !== row.feeBaseUnits) {
        await db
          .update(walletTransactions)
          .set({ status: next, feeBaseUnits: fee, blockNumber, updatedAt: now() })
          .where(eq(walletTransactions.id, row.id))
        await writeStatus(row.id, next, detail)
      }
      const updated = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, row.id))
        .limit(1)
      return { transaction: presentTransaction(updated[0] ?? row), confirmation: 'checked' as const }
    },

    async syncHistory(userId: string, walletId: string) {
      const wallet = await ownedWallet(userId, walletId, false)
      const network = requireNetwork(wallet.network)
      if (network.family === 'evm') {
        return {
          imported: 0,
          coverage:
            'EVM history is filled by the indexer after its checkpoint. EraX does not claim older Ethereum or Base history.',
        }
      }
      const reader = options.solanaReaders[network.caip2]
      if (!reader) throw new ApiError(503, 'chain_rpc_not_configured', rpcMissing(network.name))
      let imported = 0
      try {
        const signatures = await reader.getRecentSignatures(wallet.address)
        for (const row of signatures) {
          const parsed = await reader.getParsedTransfers(row.signature)
          const transfer = parsed?.find((item) => item.type === 'transfer' || item.type === 'transferChecked')
          if (!transfer) continue
          const native = transfer.program === 'system'
          const sender = String(native ? transfer.info.source ?? '' : transfer.info.authority ?? '')
          const recipient = String(native ? transfer.info.destination ?? '' : '')
          if (!native) continue
          if (sender !== wallet.address && recipient !== wallet.address) continue
          const amount = BigInt(String(transfer.info.lamports ?? '0'))
          const inserted = await db
            .insert(walletTransactions)
            .values({
              userId,
              walletId: wallet.id,
              network: network.caip2,
              hash: row.signature,
              logIndex: -1,
              sender,
              recipient,
              assetSymbol: 'SOL',
              assetAddress: '',
              amountBaseUnits: amount.toString(),
              status: row.err ? 'failed' : 'finalized',
              source: 'chain',
              blockNumber: row.slot === null ? null : BigInt(row.slot),
            })
            .onConflictDoNothing()
            .returning()
          if (inserted[0]) imported += 1
        }
      } catch (error) {
        rpcError(error)
      }
      return {
        imported,
        coverage:
          'Solana sync stores the recent finalized system transfers returned by the RPC. It is not a full account history, and SPL transfers in that page are not decoded here.',
      }
    },
  }
}

function rpcMissing(name: string): string {
  return `${name} has no RPC endpoint configured. No balance or confirmation was invented.`
}

function normalizeAddress(protocol: 'siwe' | 'siws', address: string): string {
  if (protocol === 'siwe') {
    if (!isEvmAddress(address)) throw new ApiError(400, 'invalid_address', 'That Ethereum address is not valid')
    return normalizeEvmAddress(address)
  }
  return address
}

function normalizeRecipient(family: 'evm' | 'solana', address: string): string {
  if (family === 'evm') {
    if (!isEvmAddress(address)) throw new ApiError(400, 'invalid_address', 'The recipient address is not a valid EVM address')
    return normalizeEvmAddress(address)
  }
  if (!isSolanaAddress(address)) {
    throw new ApiError(400, 'invalid_address', 'The recipient address is not a valid Solana address')
  }
  return address
}

function safeParseSiwe(message: string) {
  try {
    return parseSiweMessage(message)
  } catch (error) {
    throw new ApiError(400, 'invalid_message', error instanceof Error ? error.message : 'Malformed SIWE message')
  }
}

function safeParseSiws(message: string) {
  try {
    return parseSiwsMessage(message)
  } catch (error) {
    throw new ApiError(400, 'invalid_message', error instanceof Error ? error.message : 'Malformed SIWS message')
  }
}

async function verifySiwe(
  address: string,
  message: string,
  signature: string,
  reader: EvmReader | undefined,
): Promise<{ ok: true; method: 'ecdsa' | 'eip1271' } | { ok: false; reason: string }> {
  const ecdsa = await verifyEvmSignature({ address, message, signature })
  if (ecdsa.ok) return ecdsa
  if (!reader) return ecdsa
  try {
    const contract = await reader.verifyContractSignature(address, message, signature)
    if (contract) return { ok: true, method: 'eip1271' }
    return { ok: false, reason: 'Signature verification failed' }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Contract signature verification failed' }
  }
}

function verifySiws(address: string, message: string, signature: string) {
  try {
    const bytes = decodeSolanaSignature(signature)
    const ok = verifySolanaSignature(address, message, bytes)
    return ok
      ? { ok: true as const, method: 'ed25519' as const }
      : { ok: false as const, reason: 'Solana signature did not match this address' }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : 'Solana signature is invalid' }
  }
}

async function linkWallet(input: {
  db: Database
  now: () => Date
  userId: string | null
  family: 'evm' | 'solana'
  network: string
  address: string
  openSession: OpenSession
  ip: string | null
  userAgent: string | null
}) {
  const existingRows = await input.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.chainFamily, input.family), eq(wallets.network, input.network), eq(wallets.address, input.address)))
    .limit(1)
  const existing = existingRows[0]
  if (input.userId && existing && existing.userId !== input.userId) {
    throw new ApiError(409, 'wallet_owned_elsewhere', 'This address is already linked to another EraX account')
  }
  if (input.userId) {
    const walletId = existing
      ? await relink(input.db, input.now, existing.id)
      : await insertWallet(input.db, input.now, input.userId, input.family, input.network, input.address)
    return { userId: input.userId, walletId, session: null }
  }
  if (existing) {
    const session = await input.openSession(existing.userId, input.ip, input.userAgent)
    await relink(input.db, input.now, existing.id)
    return { userId: existing.userId, walletId: existing.id, session }
  }
  const created = await createWalletUser(input.db, input.now, input.family, input.network, input.address)
  const session = await input.openSession(created.userId, input.ip, input.userAgent)
  return { userId: created.userId, walletId: created.walletId, session }
}

async function relink(db: Database, now: () => Date, walletId: string) {
  await db
    .update(wallets)
    .set({ verifiedAt: now(), disconnectedAt: null, lastConnectedAt: now(), updatedAt: now() })
    .where(eq(wallets.id, walletId))
  return walletId
}

async function insertWallet(
  db: Database,
  now: () => Date,
  userId: string,
  family: 'evm' | 'solana',
  network: string,
  address: string,
) {
  const inserted = await db
    .insert(wallets)
    .values({
      userId,
      chainFamily: family,
      network,
      address,
      verifiedAt: now(),
      lastConnectedAt: now(),
    })
    .returning()
  const wallet = inserted[0]
  if (!wallet) throw new ApiError(500, 'internal_error', 'Wallet was not saved')
  return wallet.id
}

async function createWalletUser(
  db: Database,
  now: () => Date,
  family: 'evm' | 'solana',
  network: string,
  address: string,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = walletUsername(address, attempt)
    if (validateUsername(username)) continue
    try {
      return await db.transaction(async (tx) => {
        const userRows = await tx
          .insert(users)
          .values({ email: null, passwordHash: null, role: 'user', status: 'active' })
          .returning()
        const user = userRows[0]
        if (!user) throw new Error('User insert returned no row')
        await tx.insert(profiles).values({
          userId: user.id,
          username,
          displayName: `Wallet ${address.slice(0, 8)}`,
        })
        const walletRows = await tx
          .insert(wallets)
          .values({
            userId: user.id,
            chainFamily: family,
            network,
            address,
            verifiedAt: now(),
            lastConnectedAt: now(),
          })
          .returning()
        const wallet = walletRows[0]
        if (!wallet) throw new Error('Wallet insert returned no row')
        return { userId: user.id, walletId: wallet.id }
      })
    } catch (error) {
      if (!isUnique(error)) throw error
    }
  }
  throw new ApiError(409, 'username_taken', 'A profile name could not be reserved for this wallet')
}

function walletUsername(address: string, attempt: number): string {
  const compact = address.toLowerCase().replace(/[^a-z0-9]/g, '')
  const suffix = attempt === 0 ? '' : String(attempt)
  return `w${compact.slice(0, 16 - suffix.length)}${suffix}`.slice(0, 20)
}

function isUnique(error: unknown): boolean {
  const seen = new Set<unknown>()
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false
    seen.add(value)
    const record = value as { code?: unknown; message?: unknown; cause?: unknown }
    if (record.code === '23505') return true
    if (typeof record.message === 'string' && /unique|duplicate/i.test(record.message)) return true
    return walk(record.cause)
  }
  return walk(error)
}

function presentWallet(wallet: typeof wallets.$inferSelect) {
  const network = networkByCaip2(wallet.network)
  return {
    id: wallet.id,
    family: wallet.chainFamily,
    network: wallet.network,
    networkName: network?.name ?? wallet.network,
    address: wallet.address,
    label: wallet.label,
    preferred: wallet.preferred,
    connected: wallet.disconnectedAt === null && wallet.verifiedAt !== null,
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    explorerUrl: network ? safeExplorer(network.caip2, wallet.address) : null,
  }
}

function safeExplorer(caip2: string, reference: string): string | null {
  const network = networkByCaip2(caip2)
  if (!network) return null
  try {
    return explorerUrl(network, 'address', reference)
  } catch {
    return null
  }
}

function balanceRow(
  network: string,
  assetAddress: string,
  symbol: string | null,
  name: string | null,
  amount: bigint,
  decimals: number | null,
  verified: boolean,
) {
  return {
    network,
    assetAddress,
    symbol: symbol ? sanitizeTokenLabel(symbol) : null,
    name: name ? sanitizeTokenLabel(name) : null,
    amountBaseUnits: amount.toString(),
    amount: decimals === null ? null : formatBaseUnits(amount, decimals),
    decimals,
    verified,
  }
}

async function erc20Balance(
  reader: EvmReader,
  owner: string,
  network: string,
  trusted: TrustedAsset | null,
  contract = trusted?.contractAddress ?? '',
) {
  try {
    const read = await reader.readErc20(contract, owner)
    const decimalsAgree = trusted ? read.decimals === trusted.decimals : read.decimals !== null
    const verified = Boolean(trusted && decimalsAgree)
    return balanceRow(
      network,
      contract.toLowerCase(),
      verified ? trusted?.symbol ?? null : read.symbol,
      verified ? trusted?.name ?? null : read.name,
      read.balance,
      read.decimals,
      verified,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ChainRpcError') {
      throw new ApiError(502, 'chain_rpc_failed', error.message)
    }
    throw error
  }
}

async function resolveAsset(
  options: WalletServiceOptions,
  catalog: TrustedAsset[],
  networkCaip: string,
  assetAddress: string,
  owner: string,
): Promise<AssetChoice> {
  const network = networkByCaip2(networkCaip)
  if (!network) throw new ApiError(400, 'unknown_network', 'That network is not supported')
  if (assetAddress.trim().length === 0) {
    return {
      symbol: network.nativeSymbol,
      name: network.nativeName,
      assetAddress: '',
      decimals: network.nativeDecimals,
      verified: true,
      tokenProgram: null,
    }
  }
  const trusted = findTrustedAsset(catalog, networkCaip, assetAddress)
  if (network.family === 'evm') {
    if (!isEvmAddress(assetAddress)) throw new ApiError(400, 'invalid_address', 'Token address is invalid')
    const reader = options.evmReaders[networkCaip]
    if (!reader) {
      if (!trusted) throw new ApiError(503, 'chain_rpc_not_configured', rpcMissing(network.name))
      return {
        symbol: trusted.symbol,
        name: trusted.name,
        assetAddress: trusted.contractAddress,
        decimals: trusted.decimals,
        verified: true,
        tokenProgram: null,
      }
    }
    const read = await reader.readErc20(assetAddress, owner).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'ChainRpcError') {
        throw new ApiError(502, 'chain_rpc_failed', error.message)
      }
      throw error
    })
    if (read.decimals === null) {
      throw new ApiError(422, 'token_decimals_unavailable', 'The token contract did not return decimals')
    }
    if (trusted && read.decimals !== trusted.decimals) {
      throw new ApiError(422, 'token_decimals_mismatch', 'The token contract decimals do not match the trusted asset')
    }
    return {
      symbol: trusted?.symbol ?? sanitizeTokenLabel(read.symbol ?? 'Unknown'),
      name: trusted?.name ?? sanitizeTokenLabel(read.name ?? 'Unverified token'),
      assetAddress: assetAddress.toLowerCase(),
      decimals: read.decimals,
      verified: Boolean(trusted),
      tokenProgram: null,
    }
  }
  if (!isSolanaAddress(assetAddress)) throw new ApiError(400, 'invalid_address', 'Mint address is invalid')
  const reader = options.solanaReaders[networkCaip]
  if (!reader) throw new ApiError(503, 'chain_rpc_not_configured', rpcMissing(network.name))
  const mint = await reader.getMint(assetAddress).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'ChainRpcError') {
      throw new ApiError(502, 'chain_rpc_failed', error.message)
    }
    throw error
  })
  if (!mint) throw new ApiError(400, 'unknown_token', 'That mint is not an SPL or Token-2022 mint')
  if (trusted && mint.decimals !== trusted.decimals) {
    throw new ApiError(422, 'token_decimals_mismatch', 'The mint decimals do not match the trusted asset')
  }
  return {
    symbol: trusted?.symbol ?? 'Unknown',
    name: trusted?.name ?? 'Unverified token',
    assetAddress,
    decimals: mint.decimals,
    verified: Boolean(trusted),
    tokenProgram: mint.program,
  }
}

async function feeOrThrow(operation: () => Promise<bigint>): Promise<bigint> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && error.name === 'ChainRpcError') {
      throw new ApiError(502, 'chain_rpc_failed', error.message)
    }
    throw error
  }
}

async function assertEvmFunds(
  reader: EvmReader,
  owner: string,
  asset: AssetChoice,
  amount: bigint,
  fee: bigint | null,
) {
  const native = await reader.getNativeBalance(owner).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'ChainRpcError') throw new ApiError(502, 'chain_rpc_failed', error.message)
    throw error
  })
  if (asset.assetAddress.length === 0) {
    if (fee !== null && native < amount + fee) {
      throw new ApiError(400, 'insufficient_balance', 'The native balance is below the amount plus the estimated fee')
    }
    return
  }
  const token = await reader.readErc20(asset.assetAddress, owner)
  if (token.balance < amount) throw new ApiError(400, 'insufficient_balance', 'The token balance is below the amount')
  if (fee !== null && native < fee) {
    throw new ApiError(400, 'insufficient_fee_balance', 'The ETH balance is below the estimated network fee')
  }
}

async function assertSolanaFunds(
  reader: SolanaReader,
  owner: string,
  asset: AssetChoice,
  amount: bigint,
  fee: bigint | null,
) {
  const native = await reader.getNativeBalance(owner).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'ChainRpcError') throw new ApiError(502, 'chain_rpc_failed', error.message)
    throw error
  })
  if (asset.assetAddress.length === 0) {
    if (fee !== null && native < amount + fee) {
      throw new ApiError(400, 'insufficient_balance', 'The SOL balance is below the amount plus the estimated fee')
    }
    return
  }
  const accounts = await reader.getTokenAccounts(owner)
  const held = accounts.find((account) => account.mint === asset.assetAddress)
  if (!held || held.amount < amount) {
    throw new ApiError(400, 'insufficient_balance', 'The token balance is below the amount')
  }
  if (fee !== null && native < fee) {
    throw new ApiError(400, 'insufficient_fee_balance', 'The SOL balance is below the estimated network fee')
  }
}

function previewBody(
  network: string,
  sender: string,
  recipient: string,
  asset: AssetChoice,
  amount: bigint,
  fee: bigint | null,
  transaction: unknown,
) {
  return {
    network,
    sender,
    recipient,
    asset: {
      symbol: asset.symbol,
      name: asset.name,
      assetAddress: asset.assetAddress,
      decimals: asset.decimals,
      verified: asset.verified,
    },
    amountBaseUnits: amount.toString(),
    amount: formatBaseUnits(amount, asset.decimals),
    feeBaseUnits: fee?.toString() ?? null,
    fee: fee === null ? null : formatBaseUnits(fee, network.startsWith('solana:') ? 9 : 18),
    feeStatus: fee === null ? ('not_configured' as const) : ('estimated' as const),
    warnings:
      fee === null
        ? ['The network fee and balance were not checked because no RPC endpoint is configured.']
        : asset.verified
          ? []
          : ['This asset is not in the EraX trusted list. Its name and symbol came from the chain and are unverified.'],
    transaction,
  }
}

function validHash(family: 'evm' | 'solana', hash: string): boolean {
  if (family === 'evm') return /^0x[0-9a-fA-F]{64}$/.test(hash)
  return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash)
}

async function existingTransaction(db: Database, network: string, hash: string) {
  const rows = await db
    .select()
    .from(walletTransactions)
    .where(and(eq(walletTransactions.network, network), eq(walletTransactions.hash, hash), eq(walletTransactions.logIndex, -1)))
    .limit(1)
  return rows[0]
}

function presentTransaction(row: typeof walletTransactions.$inferSelect) {
  const network = networkByCaip2(row.network)
  let url: string | null = null
  if (network) {
    try {
      url = explorerUrl(network, 'tx', row.hash)
    } catch {
      url = null
    }
  }
  return {
    id: row.id,
    network: row.network,
    hash: row.hash,
    sender: row.sender,
    recipient: row.recipient,
    assetSymbol: row.assetSymbol,
    assetAddress: row.assetAddress,
    amountBaseUnits: row.amountBaseUnits,
    feeBaseUnits: row.feeBaseUnits,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    explorerUrl: url,
  }
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeCursor(value: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: string
      id?: string
    }
    if (!parsed.createdAt || !parsed.id) throw new Error('missing')
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'Cursor is invalid')
  }
}
