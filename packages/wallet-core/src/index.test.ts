import { describe, expect, it } from 'vitest'
import {
  assertNoWalletSecret,
  formatBaseUnits,
  parseBaseUnits,
  parseDecimalToBaseUnits,
  sanitizeTokenLabel,
} from './index'

describe('parseBaseUnits', () => {
  it('accepts integer strings and rejects decimals', () => {
    expect(parseBaseUnits('1500000')).toBe(1500000n)
    expect(() => parseBaseUnits('1.5')).toThrow(/integer/)
    expect(() => parseBaseUnits('-1')).toThrow(/integer/)
  })
})

describe('decimal amounts', () => {
  it('converts and formats without floating point', () => {
    expect(parseDecimalToBaseUnits('1.5', 18)).toBe(1500000000000000000n)
    expect(parseDecimalToBaseUnits('0.000001', 6)).toBe(1n)
    expect(formatBaseUnits(1500000000000000000n, 18)).toBe('1.5')
    expect(formatBaseUnits(0n, 9)).toBe('0')
    expect(formatBaseUnits(1n, 6)).toBe('0.000001')
    expect(() => parseDecimalToBaseUnits('1.234', 2)).toThrow(/decimal places/)
    expect(() => formatBaseUnits(1n, 19)).toThrow(/decimals/)
  })
})

describe('sanitizeTokenLabel', () => {
  it('strips control characters and does not treat a long label as trusted', () => {
    expect(sanitizeTokenLabel(' USDC\u0000 ')).toBe('USDC')
    expect(sanitizeTokenLabel('x'.repeat(40))).toHaveLength(32)
    expect(sanitizeTokenLabel('\u0000')).toBe('Unknown')
  })
})

describe('assertNoWalletSecret', () => {
  it('rejects private keys and seed phrases', () => {
    expect(() => assertNoWalletSecret({ privateKey: '0xabc' })).toThrow(/secret/)
    expect(() => assertNoWalletSecret({ nested: { seedPhrase: 'abandon' } })).toThrow(/secret/)
    expect(() => assertNoWalletSecret({ address: '0x' + 'ab'.repeat(20) })).not.toThrow()
  })
})
