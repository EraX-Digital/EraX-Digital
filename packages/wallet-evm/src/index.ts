import type { WalletAuthStatus } from '@erax/shared-types'

export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function siweStatus(): WalletAuthStatus {
  return {
    protocol: 'siwe',
    implemented: false,
    missing: [
      'server challenge nonce',
      'EIP-4361 signature verification',
      'domain binding',
      'chain id check',
      'single-use nonce and replay protection',
    ],
  }
}
