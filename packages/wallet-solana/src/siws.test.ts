import { ed25519 } from '@noble/curves/ed25519.js'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  buildSiwsMessage,
  decodeSolanaSignature,
  parseSiwsMessage,
  verifySolanaSignature,
} from './index'

const fields = {
  domain: '127.0.0.1:3000',
  statement: 'Sign in to EraX.',
  uri: 'http://127.0.0.1:3000',
  version: '1' as const,
  chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  nonce: 'cd'.repeat(16),
  issuedAt: '2026-11-04T00:00:00.000Z',
  expirationTime: '2026-11-04T00:10:00.000Z',
}

function testKey() {
  const generated = ed25519.keygen()
  return { secret: generated.secretKey, address: new PublicKey(generated.publicKey).toBase58() }
}

describe('SIWS', () => {
  it('verifies an ed25519 signature and rejects a second key', () => {
    const signer = testKey()
    const message = buildSiwsMessage({ ...fields, address: signer.address })
    expect(parseSiwsMessage(message).chainId).toBe(fields.chainId)
    const signature = ed25519.sign(new TextEncoder().encode(message), signer.secret)
    const encoded = Buffer.from(signature).toString('base64')
    expect(
      verifySolanaSignature(signer.address, message, decodeSolanaSignature(encoded)),
    ).toBe(true)
    const other = testKey()
    expect(
      verifySolanaSignature(other.address, message, decodeSolanaSignature(encoded)),
    ).toBe(false)
  })

  it('rejects a message that was edited after it was built', () => {
    const signer = testKey()
    const message = buildSiwsMessage({ ...fields, address: signer.address })
    expect(() => parseSiwsMessage(message.replace('Nonce: ', 'Nonce: zz'))).toThrow(/nonce/i)
    expect(() => decodeSolanaSignature('aaaa')).toThrow(/64 bytes/)
  })
})
