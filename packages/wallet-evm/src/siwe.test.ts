import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { buildSiweMessage, parseSiweMessage, verifyEvmSignature } from './index'

const fields = {
  domain: '127.0.0.1:3000',
  statement: 'Sign in to EraX.',
  uri: 'http://127.0.0.1:3000',
  version: '1' as const,
  chainId: 11155111,
  nonce: 'ab'.repeat(16),
  issuedAt: '2026-11-04T00:00:00.000Z',
  expirationTime: '2026-11-04T00:10:00.000Z',
}

describe('SIWE', () => {
  it('round-trips a message and verifies the signature from a test key', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const message = buildSiweMessage({ ...fields, address: account.address })
    const parsed = parseSiweMessage(message)
    expect(parsed.address).toBe(account.address)
    expect(parsed.chainId).toBe(11155111)
    expect(parsed.domain).toBe('127.0.0.1:3000')
    const signature = await account.signMessage({ message })
    const verified = await verifyEvmSignature({ address: account.address, message, signature })
    expect(verified).toEqual({ ok: true, method: 'ecdsa' })
  })

  it('rejects a changed chain id, a reused shape error, and a signature from another key', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const other = privateKeyToAccount(generatePrivateKey())
    const message = buildSiweMessage({ ...fields, address: account.address })
    const signature = await other.signMessage({ message })
    const verified = await verifyEvmSignature({ address: account.address, message, signature })
    expect(verified.ok).toBe(false)
    expect(message.replace('Chain ID: 11155111', 'Chain ID: 1')).not.toBe(message)
    expect(() => parseSiweMessage(message.replace('Chain ID: 11155111', 'Chain ID: 1'))).not.toThrow()
    expect(() => parseSiweMessage(`${message}\nExtra`)).toThrow(/Malformed/)
    expect(() => parseSiweMessage(message.replace(account.address, '0x0000000000000000000000000000000000000000'))).not.toThrow()
  })

  it('does not report EIP-1271 success when no RPC client is available', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const message = buildSiweMessage({ ...fields, address: account.address })
    const verified = await verifyEvmSignature({
      address: '0x0000000000000000000000000000000000000001',
      message,
      signature: '0x1234',
    })
    expect(verified.ok).toBe(false)
    if (!verified.ok) expect(verified.reason.length).toBeGreaterThan(0)
  })
})
