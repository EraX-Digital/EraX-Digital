import { withRpcRetry } from '@erax/blockchain-common'
import type { WalletAuthStatus } from '@erax/shared-types'
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js'

const SIGN_IN_STATEMENT = 'Sign in to EraX.'
const LINK_STATEMENT = 'Link this wallet to your EraX account.'
const SOLANA_HEADER = ' wants you to sign in with your Solana account:'
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

export class ChainRpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChainRpcError'
  }
}

export function isSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value
  } catch {
    return false
  }
}

export function siwsStatus(): WalletAuthStatus {
  return {
    protocol: 'siws',
    implemented: true,
    missing: [],
  }
}

export type SiwsMessageFields = {
  domain: string
  address: string
  statement: string
  uri: string
  version: '1'
  chainId: string
  nonce: string
  issuedAt: string
  expirationTime: string
}

function isoTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('SIWS timestamp is not a UTC ISO-8601 value')
  }
  return value
}

export function buildSiwsMessage(input: SiwsMessageFields): string {
  if (!isSolanaAddress(input.address)) throw new Error('SIWS address is invalid')
  if (input.statement !== SIGN_IN_STATEMENT && input.statement !== LINK_STATEMENT) {
    throw new Error('SIWS statement is not recognized')
  }
  if (!/^[0-9a-f]{32}$/.test(input.nonce)) throw new Error('SIWS nonce is invalid')
  if (!input.chainId.startsWith('solana:')) throw new Error('SIWS chain id is invalid')
  isoTimestamp(input.issuedAt)
  isoTimestamp(input.expirationTime)
  return [
    `${input.domain}${SOLANA_HEADER}`,
    input.address,
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
    throw new Error('Malformed SIWS message')
  }
  return line.slice(prefix.length)
}

export function parseSiwsMessage(message: string): SiwsMessageFields {
  const lines = message.split('\n')
  if (lines.length !== 11 || lines[2] !== '' || lines[4] !== '') {
    throw new Error('Malformed SIWS message')
  }
  const header = lines[0] ?? ''
  if (!header.endsWith(SOLANA_HEADER)) throw new Error('Malformed SIWS message')
  const domain = header.slice(0, -SOLANA_HEADER.length)
  if (domain.length === 0 || domain.trim() !== domain || /\s/.test(domain)) {
    throw new Error('Malformed SIWS domain')
  }
  const address = lines[1] ?? ''
  if (!isSolanaAddress(address)) throw new Error('Malformed SIWS address')
  const statement = lines[3] ?? ''
  if (statement !== SIGN_IN_STATEMENT && statement !== LINK_STATEMENT) {
    throw new Error('SIWS statement is not recognized')
  }
  const chainId = prefixed(lines[7] ?? '', 'Chain ID: ')
  if (!chainId.startsWith('solana:')) throw new Error('Malformed SIWS chain id')
  const nonce = prefixed(lines[8] ?? '', 'Nonce: ')
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error('Malformed SIWS nonce')
  return {
    domain,
    address,
    statement,
    uri: prefixed(lines[5] ?? '', 'URI: '),
    version: '1',
    chainId,
    nonce,
    issuedAt: isoTimestamp(prefixed(lines[9] ?? '', 'Issued At: ')),
    expirationTime: isoTimestamp(prefixed(lines[10] ?? '', 'Expiration Time: ')),
  }
}

export function decodeSolanaSignature(value: string): Uint8Array {
  const trimmed = value.trim()
  const bytes = trimmed.startsWith('0x')
    ? Buffer.from(trimmed.slice(2), 'hex')
    : Buffer.from(trimmed, 'base64')
  if (bytes.length !== 64) throw new Error('Solana signature must be 64 bytes')
  return new Uint8Array(bytes)
}

export function verifySolanaSignature(address: string, message: string, signature: Uint8Array): boolean {
  if (!isSolanaAddress(address) || signature.length !== 64) return false
  return ed25519.verify(signature, new TextEncoder().encode(message), new PublicKey(address).toBytes())
}

export type SerializedInstruction = {
  programId: string
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>
  dataBase64: string
}

function safeNumber(amount: bigint, label: string): number {
  if (amount <= 0n || amount > MAX_SAFE) {
    throw new Error(`${label} must be a positive amount that fits a safe integer`)
  }
  return Number(amount)
}

function serialize(instruction: TransactionInstruction): SerializedInstruction {
  return {
    programId: instruction.programId.toBase58(),
    keys: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(instruction.data).toString('base64'),
  }
}

export function buildSolTransfer(input: {
  from: string
  to: string
  amountBaseUnits: bigint
}): SerializedInstruction[] {
  if (!isSolanaAddress(input.from) || !isSolanaAddress(input.to)) {
    throw new Error('Solana address is invalid')
  }
  return [
    serialize(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(input.from),
        toPubkey: new PublicKey(input.to),
        lamports: safeNumber(input.amountBaseUnits, 'SOL amount'),
      }),
    ),
  ]
}

export function buildSplTransfer(input: {
  from: string
  to: string
  mint: string
  amountBaseUnits: bigint
  tokenProgram: 'spl' | 'token2022'
}): SerializedInstruction[] {
  if (!isSolanaAddress(input.from) || !isSolanaAddress(input.to) || !isSolanaAddress(input.mint)) {
    throw new Error('Solana address is invalid')
  }
  const program = input.tokenProgram === 'token2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
  const mint = new PublicKey(input.mint)
  const owner = new PublicKey(input.from)
  const recipient = new PublicKey(input.to)
  const source = getAssociatedTokenAddressSync(mint, owner, false, program, ASSOCIATED_TOKEN_PROGRAM_ID)
  const destination = getAssociatedTokenAddressSync(mint, recipient, true, program, ASSOCIATED_TOKEN_PROGRAM_ID)
  return [
    serialize(
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        destination,
        recipient,
        mint,
        program,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    ),
    serialize(
      createTransferInstruction(
        source,
        destination,
        owner,
        safeNumber(input.amountBaseUnits, 'Token amount'),
        [],
        program,
      ),
    ),
  ]
}

type ParsedTransfer = {
  program: string
  type: string
  info: Record<string, unknown>
}

export function solanaTransferMatches(
  instructions: ParsedTransfer[],
  recorded: { sender: string; recipient: string; amountBaseUnits: bigint; assetAddress: string },
): boolean {
  if (recorded.assetAddress.length === 0) {
    return instructions.some((instruction) => {
      return (
        instruction.program === 'system' &&
        instruction.type === 'transfer' &&
        instruction.info.source === recorded.sender &&
        instruction.info.destination === recorded.recipient &&
        BigInt(String(instruction.info.lamports ?? '0')) === recorded.amountBaseUnits
      )
    })
  }
  const mint = new PublicKey(recorded.assetAddress)
  const recipient = new PublicKey(recorded.recipient)
  const expected = [
    getAssociatedTokenAddressSync(mint, recipient, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58(),
    getAssociatedTokenAddressSync(mint, recipient, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58(),
  ]
  return instructions.some((instruction) => {
    if (instruction.program !== 'spl-token') return false
    if (instruction.type !== 'transfer' && instruction.type !== 'transferChecked') return false
    if (instruction.info.authority !== recorded.sender) return false
    const amount = BigInt(String(instruction.info.amount ?? instruction.info.tokenAmount ?? '0'))
    if (amount !== recorded.amountBaseUnits) return false
    const destination = String(instruction.info.destination ?? '')
    return expected.includes(destination)
  })
}

function rpcFailure(error: unknown): ChainRpcError {
  const message = error instanceof Error ? error.message : 'RPC request failed'
  return new ChainRpcError(message.replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 300))
}

function lamports(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ChainRpcError('The RPC returned a lamport amount that is not a safe integer')
  }
  return BigInt(value)
}

export type SolanaTokenBalance = {
  mint: string
  amount: bigint
  decimals: number
  program: 'spl' | 'token2022'
}

export type SolanaReader = {
  getNativeBalance(address: string): Promise<bigint>
  getTokenAccounts(owner: string): Promise<SolanaTokenBalance[]>
  getMint(mint: string): Promise<{ decimals: number; program: 'spl' | 'token2022' } | null>
  estimateFee(payer: string, instructions: SerializedInstruction[]): Promise<bigint>
  getSignatureStatus(signature: string): Promise<'pending' | 'finalized' | 'failed'>
  getParsedTransfers(signature: string): Promise<ParsedTransfer[] | null>
  getTransactionLogs?(signature: string): Promise<readonly string[] | null>
  getRecentSignatures(
    address: string,
  ): Promise<Array<{ signature: string; slot: number | null; err: boolean; blockTime: number | null }>>
}

function rebuild(instruction: SerializedInstruction): TransactionInstruction {
  return {
    programId: new PublicKey(instruction.programId),
    keys: instruction.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.dataBase64, 'base64'),
  }
}

function parsedTransfers(instructions: readonly unknown[]): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = []
  for (const instruction of instructions) {
    if (!instruction || typeof instruction !== 'object' || !('parsed' in instruction)) continue
    const row = instruction as { parsed?: unknown; program?: unknown }
    if (!row.parsed || typeof row.parsed !== 'object') continue
    const parsed = row.parsed as { type?: unknown; info?: unknown }
    if (typeof parsed.type !== 'string' || !parsed.info || typeof parsed.info !== 'object') continue
    transfers.push({
      program: String(row.program ?? ''),
      type: parsed.type,
      info: parsed.info as Record<string, unknown>,
    })
  }
  return transfers
}

export function createSolanaReader(rpcUrl: string): SolanaReader {
  const connection = new Connection(rpcUrl, 'finalized')
  return {
    async getNativeBalance(address) {
      try {
        const value = await withRpcRetry(() => connection.getBalance(new PublicKey(address), 'finalized'))
        return lamports(value)
      } catch (error) {
        if (error instanceof ChainRpcError) throw error
        throw rpcFailure(error)
      }
    },
    async getTokenAccounts(owner) {
      try {
        const ownerKey = new PublicKey(owner)
        const groups = [
          [TOKEN_PROGRAM_ID, 'spl'],
          [TOKEN_2022_PROGRAM_ID, 'token2022'],
        ] as const
        const balances: SolanaTokenBalance[] = []
        for (const [program, name] of groups) {
          const response = await withRpcRetry(() =>
            connection.getParsedTokenAccountsByOwner(ownerKey, { programId: program }, 'finalized'),
          )
          for (const row of response.value) {
            const info = row.account.data.parsed.info as {
              mint: string
              tokenAmount: { amount: string; decimals: number }
            }
            balances.push({
              mint: info.mint,
              amount: BigInt(info.tokenAmount.amount),
              decimals: info.tokenAmount.decimals,
              program: name,
            })
          }
        }
        return balances
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getMint(mint) {
      try {
        const info = await withRpcRetry(() => connection.getAccountInfo(new PublicKey(mint), 'finalized'))
        if (!info || info.data.length < 45) return null
        const owner = info.owner.toBase58()
        const program =
          owner === TOKEN_PROGRAM_ID.toBase58()
            ? 'spl'
            : owner === TOKEN_2022_PROGRAM_ID.toBase58()
              ? 'token2022'
              : null
        if (!program) return null
        const decimals = info.data[44] ?? null
        if (decimals === null || decimals > 18) return null
        return { decimals, program }
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async estimateFee(payer, instructions) {
      try {
        const latest = await withRpcRetry(() => connection.getLatestBlockhash('finalized'))
        const transaction = new Transaction({ feePayer: new PublicKey(payer), recentBlockhash: latest.blockhash })
        for (const instruction of instructions) transaction.add(rebuild(instruction))
        const fee = await withRpcRetry(() => connection.getFeeForMessage(transaction.compileMessage(), 'finalized'))
        if (fee.value === null) throw new ChainRpcError('The RPC did not return a fee')
        return lamports(fee.value)
      } catch (error) {
        if (error instanceof ChainRpcError) throw error
        throw rpcFailure(error)
      }
    },
    async getSignatureStatus(signature) {
      try {
        const status = await withRpcRetry(() =>
          connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
        )
        const row = status.value[0]
        if (!row) return 'pending'
        if (row.err) return 'failed'
        return row.confirmationStatus === 'finalized' ? 'finalized' : 'pending'
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getTransactionLogs(signature) {
      try {
        const transaction = await withRpcRetry(() =>
          connection.getTransaction(signature, {
            commitment: 'finalized',
            maxSupportedTransactionVersion: 0,
          }),
        )
        return transaction?.meta?.logMessages ?? null
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getParsedTransfers(signature) {
      try {
        const transaction = await withRpcRetry(() =>
          connection.getParsedTransaction(signature, {
            commitment: 'finalized',
            maxSupportedTransactionVersion: 0,
          }),
        )
        if (!transaction) return null
        return parsedTransfers(transaction.transaction.message.instructions)
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    async getRecentSignatures(address) {
      try {
        const rows = await withRpcRetry(() =>
          connection.getSignaturesForAddress(new PublicKey(address), { limit: 20 }, 'finalized'),
        )
        return rows.map((row) => ({
          signature: row.signature,
          slot: row.slot ?? null,
          err: row.err !== null,
          blockTime: row.blockTime ?? null,
        }))
      } catch (error) {
        throw rpcFailure(error)
      }
    },
  }
}

export type SolanaIndexedSignature = {
  signature: string
  slot: number | null
  err: boolean
  blockTime: number | null
}

export function createSolanaIndexerReader(rpcUrl: string) {
  const reader = createSolanaReader(rpcUrl)
  return {
    async getSlot() {
      try {
        const connection = new Connection(rpcUrl, 'finalized')
        return await withRpcRetry(() => connection.getSlot('finalized'))
      } catch (error) {
        throw rpcFailure(error)
      }
    },
    getRecentSignatures(address: string): Promise<SolanaIndexedSignature[]> {
      return reader.getRecentSignatures(address)
    },
    getParsedTransfers: reader.getParsedTransfers,
    getTransactionLogs: reader.getTransactionLogs,
  }
}
