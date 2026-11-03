import type { WalletAuthStatus } from '@erax/shared-types'

export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

export function siwsStatus(): WalletAuthStatus {
  return {
    protocol: 'siws',
    implemented: false,
    missing: [
      'server challenge nonce',
      'ed25519 signature verification',
      'domain binding',
      'cluster check',
      'single-use nonce and replay protection',
    ],
  }
}
