import { describe, expect, it } from 'vitest'
import { assertNoWalletSecret, parseBaseUnits } from './index'

describe('parseBaseUnits', () => {
  it('accepts integer strings and rejects decimals', () => {
    expect(parseBaseUnits('1500000')).toBe(1500000n)
    expect(() => parseBaseUnits('1.5')).toThrow(/integer/)
    expect(() => parseBaseUnits('-1')).toThrow(/integer/)
  })
})

describe('assertNoWalletSecret', () => {
  it('rejects private keys and seed phrases', () => {
    expect(() => assertNoWalletSecret({ privateKey: '0xabc' })).toThrow(/secret/)
    expect(() => assertNoWalletSecret({ nested: { seedPhrase: 'abandon' } })).toThrow(/secret/)
    expect(() => assertNoWalletSecret({ address: '0x' + 'ab'.repeat(20) })).not.toThrow()
  })
})
