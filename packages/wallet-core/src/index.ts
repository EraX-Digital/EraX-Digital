export type ChainFamily = 'evm' | 'solana'

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'reverted' | 'finalized'

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
