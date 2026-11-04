export type ChainFamily = 'evm' | 'solana'

export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'reverted'
  | 'finalized'
  | 'dropped'

export type WalletProviderName =
  | 'metamask'
  | 'injected'
  | 'coinbase'
  | 'walletconnect'
  | 'phantom'
  | 'solflare'
  | 'backpack'
  | 'unknown'

export type WalletConnector = {
  id: string
  provider: WalletProviderName
  family: ChainFamily
  name: string
}

export type WalletAccount = {
  family: ChainFamily
  address: string
  network: string
}

export type WalletNetwork = {
  family: ChainFamily
  caip2: string
  name: string
  nativeSymbol: string
  nativeDecimals: number
  environment: 'mainnet' | 'testnet'
}

export type WalletBalance = {
  network: string
  address: string
  assetAddress: string
  symbol: string | null
  name: string | null
  amountBaseUnits: string
  decimals: number | null
  verified: boolean
}

export type WalletTransaction = {
  network: string
  hash: string
  sender: string
  recipient: string
  assetAddress: string
  amountBaseUnits: string
  feeBaseUnits: string | null
  status: TransactionStatus
  source: 'erax' | 'chain'
}

export type WalletSignature = {
  family: ChainFamily
  address: string
  message: string
  signature: string
}

export type WalletError = {
  code: string
  message: string
  family: ChainFamily | null
}

const SECRET_KEYS = new Set([
  'privatekey',
  'privatekeys',
  'seedphrase',
  'seed',
  'mnemonic',
  'secretkey',
  'recoveryphrase',
])

export function parseBaseUnits(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error('Amounts must be integer strings in base units')
  }
  return BigInt(value)
}

export function parseDecimalToBaseUnits(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be an integer from 0 to 18')
  }
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    throw new Error('Amount must be a positive decimal string')
  }
  const parts = value.split('.')
  const whole = parts[0] ?? '0'
  const fraction = parts[1] ?? ''
  if (fraction.length > decimals) {
    throw new Error('Amount has more decimal places than the asset allows')
  }
  const scale = 10n ** BigInt(decimals)
  const fractionPadded = fraction.padEnd(decimals, '0')
  return BigInt(whole) * scale + (fractionPadded.length > 0 ? BigInt(fractionPadded) : 0n)
}

export function formatBaseUnits(amount: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be an integer from 0 to 18')
  }
  const negative = amount < 0n
  const value = negative ? -amount : amount
  const scale = 10n ** BigInt(decimals)
  const whole = value / scale
  const fraction = value % scale
  const fractionText =
    decimals === 0 ? '' : fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  const text = fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString()
  return negative ? `-${text}` : text
}

export function sanitizeTokenLabel(value: string): string {
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
  return cleaned.length > 0 ? cleaned : 'Unknown'
}

export function assertNoWalletSecret(value: unknown): void {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '')
      if (SECRET_KEYS.has(normalized)) {
        throw new Error('Wallet secret material is not accepted')
      }
      walk(child)
    }
  }
  walk(value)
}
