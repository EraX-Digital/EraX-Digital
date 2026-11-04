import type { WalletAuthStatus } from '@erax/shared-types'
import { withRpcRetry } from '@erax/blockchain-common'
import {
  createPublicClient,
  decodeFunctionData,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  verifyMessage,
  type Hex,
  type PublicClient,
} from 'viem'

const SIGN_IN_STATEMENT = 'Sign in to EraX.'
const LINK_STATEMENT = 'Link this wallet to your EraX account.'
const ETHEREUM_HEADER = ' wants you to sign in with your Ethereum account:'

export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export function isEvmAddress(value: string): boolean {
  return isAddress(value)
}

export function normalizeEvmAddress(value: string): string {
  return getAddress(value).toLowerCase()
}

export function siweStatus(): WalletAuthStatus {
  return {
    protocol: 'siwe',
    implemented: true,
    missing: [
      'EIP-1271 contract-wallet checks run only when an RPC URL is configured, and that path has no automated contract-wallet test.',
    ],
  }
}

export type SiweMessageFields = {
  domain: string
  address: string
  statement: string
  uri: string
  version: '1'
  chainId: number
  nonce: string
  issuedAt: string
  expirationTime: string
}

function isoTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('SIWE timestamp is not a UTC ISO-8601 value')
  }
  return value
}

export function buildSiweMessage(input: SiweMessageFields): string {
  if (input.statement !== SIGN_IN_STATEMENT && input.statement !== LINK_STATEMENT) {
    throw new Error('SIWE statement is not recognized')
  }
  if (!/^[0-9a-f]{32}$/.test(input.nonce)) throw new Error('SIWE nonce is invalid')
  isoTimestamp(input.issuedAt)
  isoTimestamp(input.expirationTime)
  const address = getAddress(input.address)
  return [
    `${input.domain}${ETHEREUM_HEADER}`,
    address,
    '',
    input.statement,
    '',
    `URI: ${input.uri}`,
    'Version: 1',
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join('\n')
}

function prefixed(line: string, prefix: string): string {
  if (!line.startsWith(prefix) || line.length === prefix.length) {
    throw new Error('Malformed SIWE message')
  }
  return line.slice(prefix.length)
}

export function parseSiweMessage(message: string): SiweMessageFields {
  const lines = message.split('\n')
  if (lines.length !== 11 || lines[2] !== '' || lines[4] !== '') {
    throw new Error('Malformed SIWE message')
  }
  const header = lines[0] ?? ''
  if (!header.endsWith(ETHEREUM_HEADER)) throw new Error('Malformed SIWE message')
  const domain = header.slice(0, -ETHEREUM_HEADER.length)
  if (domain.length === 0 || domain.trim() !== domain || /\s/.test(domain)) {
    throw new Error('Malformed SIWE domain')
  }
  const addressLine = lines[1] ?? ''
  if (!isAddress(addressLine)) throw new Error('Malformed SIWE address')
  const statement = lines[3] ?? ''
  if (statement !== SIGN_IN_STATEMENT && statement !== LINK_STATEMENT) {
    throw new Error('SIWE statement is not recognized')
  }
  const chainText = prefixed(lines[7] ?? '', 'Chain ID: ')
  if (!/^[0-9]+$/.test(chainText)) throw new Error('Malformed SIWE chain id')
  const nonce = prefixed(lines[8] ?? '', 'Nonce: ')
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error('Malformed SIWE nonce')
  return {
    domain,
    address: getAddress(addressLine),
    statement,
    uri: prefixed(lines[5] ?? '', 'URI: '),
    version: '1',
    chainId: Number(chainText),
    nonce,
    issuedAt: isoTimestamp(prefixed(lines[9] ?? '', 'Issued At: ')),
    expirationTime: isoTimestamp(prefixed(lines[10] ?? '', 'Expiration Time: ')),
  }
}

export async function verifyEvmSignature(input: {
  address: string
  message: string
  signature: string
  publicClient?: PublicClient | null
}): Promise<{ ok: true; method: 'ecdsa' | 'eip1271' } | { ok: false; reason: string }> {
  if (!isAddress(input.address) || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
    return { ok: false, reason: 'Address or signature is not valid' }
  }
  const address = getAddress(input.address)
  const signature = input.signature as Hex
  try {
    if (await verifyMessage({ address, message: input.message, signature })) {
      return { ok: true, method: 'ecdsa' }
    }
  } catch (error) {
    if (!input.publicClient) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Signature verification failed',
      }
    }
  }
  if (!input.publicClient) {
    return {
      ok: false,
      reason:
        'Signature did not match this address. Contract wallet verification needs an RPC URL for this chain.',
    }
  }
  try {
    const valid = await input.publicClient.verifyMessage({ address, message: input.message, signature })
    if (valid) return { ok: true, method: 'eip1271' }
    return { ok: false, reason: 'Signature verification failed' }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Contract signature verification failed',
    }
  }
}

export type UnsignedEvmTransaction = {
  chainId: number
  to: `0x${string}`
  value: bigint
  data: Hex
}

export function buildEthTransfer(input: {
  chainId: number
  to: string
  amountBaseUnits: bigint
}): UnsignedEvmTransaction {
  if (input.amountBaseUnits <= 0n) throw new Error('Transfer amount must be greater than zero')
  return {
    chainId: input.chainId,
    to: getAddress(input.to),
    value: input.amountBaseUnits,
    data: '0x',
  }
}

export function buildErc20Transfer(input: {
  chainId: number
  token: string
  to: string
  amountBaseUnits: bigint
}): UnsignedEvmTransaction {
  if (input.amountBaseUnits <= 0n) throw new Error('Transfer amount must be greater than zero')
  return {
    chainId: input.chainId,
    to: getAddress(input.token),
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [getAddress(input.to), input.amountBaseUnits],
    }),
  }
}

export function evmTransactionMatches(
  transaction: { from: string; to: string | null; value: bigint; input: string },
  recorded: { sender: string; recipient: string; amountBaseUnits: bigint; assetAddress: string },
): boolean {
  if (!isAddress(transaction.from) || !isAddress(recorded.sender)) return false
  if (getAddress(transaction.from) !== getAddress(recorded.sender)) return false
  if (recorded.assetAddress.length === 0) {
    return (
      transaction.to !== null &&
      isAddress(transaction.to) &&
      isAddress(recorded.recipient) &&
      getAddress(transaction.to) === getAddress(recorded.recipient) &&
      transaction.value === recorded.amountBaseUnits
    )
  }
  if (
    transaction.to === null ||
    !isAddress(transaction.to) ||
    getAddress(transaction.to) !== getAddress(recorded.assetAddress)
  ) {
    return false
  }
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input as Hex })
    if (decoded.functionName !== 'transfer') return false
    const [recipient, amount] = decoded.args
    return getAddress(recipient) === getAddress(recorded.recipient) && amount === recorded.amountBaseUnits
  } catch {
    return false
  }
}

export function addressFromTopic(topic: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) return null
  const address = `0x${topic.slice(-40)}`
  return isAddress(address) ? address.toLowerCase() : null
}

export function amountFromLogData(data: string): bigint | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(data)) return null
  return BigInt(data)
}

export class ChainRpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChainRpcError'
  }
}

function rpcFailure(error: unknown): ChainRpcError {
  const message = error instanceof Error ? error.message : 'RPC request failed'
  return new ChainRpcError(message.replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 300))
}

function chainFor(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `EVM ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
}

export type EvmChainTransaction = {
  from: string
  to: string | null
  value: bigint
  input: Hex
}

export type EvmReceiptStatus = {
  status: 'success' | 'reverted'
  feeBaseUnits: string
  blockNumber: bigint
}

export type EvmReader = {
  getNativeBalance(address: string): Promise<bigint>
  readErc20(
    contract: string,
    owner: string,
  ): Promise<{ balance: bigint; decimals: number | null; symbol: string | null; name: string | null }>
  estimateFee(transaction: UnsignedEvmTransaction & { from: string }): Promise<bigint>
  getTransaction(hash: string): Promise<EvmChainTransaction | null>
  getReceipt(hash: string): Promise<EvmReceiptStatus | null>
  verifyContractSignature(address: string, message: string, signature: string): Promise<boolean>
}

export function createViemReader(rpcUrl: string, chainId: number): EvmReader {
  const client = createPublicClient({ chain: chainFor(chainId, rpcUrl), transport: http(rpcUrl) })
  return {
    async getNativeBalance(address) {
      try {
        return await withRpcRetry(() => client.getBalance({ address: getAddress(address) }))
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async readErc20(contract, owner) {
      const token = getAddress(contract)
      const account = getAddress(owner)
      try {
        const balance = await withRpcRetry(() =>
          client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        )
        const [decimals, symbol, name] = await Promise.all([
          readOptional(() => client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })),
          readOptional(() => client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' })),
          readOptional(() => client.readContract({ address: token, abi: erc20Abi, functionName: 'name' })),
        ])
        return {
          balance,
          decimals: typeof decimals === 'number' ? decimals : null,
          symbol: typeof symbol === 'string' ? symbol : null,
          name: typeof name === 'string' ? name : null,
        }
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async estimateFee(transaction) {
      try {
        const gas = await withRpcRetry(() =>
          client.estimateGas({
            account: getAddress(transaction.from),
            to: transaction.to,
            value: transaction.value,
            data: transaction.data,
          }),
        )
        const fees = await withRpcRetry(() => client.estimateFeesPerGas())
        const price = fees.maxFeePerGas ?? 0n
        if (price <= 0n) throw new ChainRpcError('The RPC did not return a gas price')
        return gas * price
      } catch (error) {
        if (error instanceof ChainRpcError) throw error
        throw rpcFailure(error)
      }
    },
    async getTransaction(hash) {
      try {
        const transaction = await withRpcRetry(() =>
          client.getTransaction({ hash: hash as Hex }),
        )
        return {
          from: transaction.from,
          to: transaction.to,
          value: transaction.value,
          input: transaction.input,
        }
      } catch (error) {
        if (error instanceof TransactionNotFoundError) return null
        throw rpcFailure(error)
      }
    },
    async verifyContractSignature(address, message, signature) {
      try {
        return await withRpcRetry(() =>
          client.verifyMessage({
            address: getAddress(address),
            message,
            signature: signature as Hex,
          }),
        )
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getReceipt(hash) {
      try {
        const receipt = await withRpcRetry(() => client.getTransactionReceipt({ hash: hash as Hex }))
        return {
          status: receipt.status,
          feeBaseUnits: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
          blockNumber: receipt.blockNumber,
        }
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null
        throw rpcFailure(error)
      }
    },
  }
}

async function readOptional<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation()
  } catch {
    return null
  }
}

export type IndexedEvmBlock = {
  number: bigint
  hash: Hex
  parentHash: Hex
  timestamp: number
  transactions: Array<{ hash: Hex; from: string; to: string | null; value: bigint }>
  logs: Array<{
    transactionHash: Hex
    logIndex: number
    address: string
    topics: string[]
    data: string
  }>
}

export function createViemIndexerReader(rpcUrl: string, chainId: number) {
  const client = createPublicClient({ chain: chainFor(chainId, rpcUrl), transport: http(rpcUrl) })
  return {
    async getBlockNumber() {
      try {
        return await withRpcRetry(() => client.getBlockNumber())
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getBlock(number: bigint): Promise<IndexedEvmBlock> {
      try {
        return await withRpcRetry(async () => {
          const block = await client.getBlock({ blockNumber: number, includeTransactions: true })
          const logs = await client.getLogs({ fromBlock: number, toBlock: number })
          if (block.number !== number || !block.hash) {
            throw new ChainRpcError('Block result did not match the requested height')
          }
          return {
            number: block.number,
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: Number(block.timestamp),
            transactions: block.transactions.map((transaction) => {
              if (typeof transaction === 'string') {
                throw new ChainRpcError('Block transactions were not expanded')
              }
              return {
                hash: transaction.hash,
                from: transaction.from,
                to: transaction.to,
                value: transaction.value,
              }
            }),
            logs: logs.map((log) => ({
              transactionHash: log.transactionHash ?? '0x',
              logIndex: log.logIndex ?? -1,
              address: log.address,
              topics: log.topics.map(String),
              data: log.data,
            })),
          }
        })
      } catch (error) {
        if (error instanceof ChainRpcError) throw error
        throw rpcFailure(error)
      }
    },
  }
}

export {
  buildCreatorMetadataUpdate,
  buildCreatorRegistration,
  buildCreatorTip,
  creatorRegistryAbi,
  creatorTippingAbi,
} from './creator-contracts'
