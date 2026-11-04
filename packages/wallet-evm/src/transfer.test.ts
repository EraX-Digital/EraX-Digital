import { describe, expect, it } from 'vitest'
import {
  ERC20_TRANSFER_TOPIC,
  addressFromTopic,
  amountFromLogData,
  buildErc20Transfer,
  buildEthTransfer,
  evmTransactionMatches,
} from './index'

describe('EVM transfers', () => {
  it('builds a native transfer without signing it', () => {
    const transaction = buildEthTransfer({
      chainId: 11155111,
      to: '0x0000000000000000000000000000000000000002',
      amountBaseUnits: 1000n,
    })
    expect(transaction).toMatchObject({ chainId: 11155111, value: 1000n, data: '0x' })
    expect(() => buildEthTransfer({ ...transaction, to: transaction.to, amountBaseUnits: 0n })).toThrow(/zero/)
  })

  it('builds an ERC-20 transfer and matches the chain transaction fields', () => {
    const token = '0x0000000000000000000000000000000000000003'
    const recipient = '0x0000000000000000000000000000000000000004'
    const sender = '0x0000000000000000000000000000000000000005'
    const transaction = buildErc20Transfer({
      chainId: 1,
      token,
      to: recipient,
      amountBaseUnits: 42n,
    })
    expect(transaction.data.startsWith('0xa9059cbb')).toBe(true)
    expect(transaction.value).toBe(0n)
    expect(
      evmTransactionMatches(
        { from: sender, to: transaction.to, value: 0n, input: transaction.data },
        { sender, recipient, amountBaseUnits: 42n, assetAddress: token },
      ),
    ).toBe(true)
    expect(
      evmTransactionMatches(
        { from: sender, to: transaction.to, value: 0n, input: transaction.data },
        { sender, recipient, amountBaseUnits: 41n, assetAddress: token },
      ),
    ).toBe(false)
  })

  it('reads a transfer log topic without treating the token as verified', () => {
    const topic =
      '0x00000000000000000000000000000000000000000000000000000000000000ab'
    expect(addressFromTopic(topic)).toBe('0x00000000000000000000000000000000000000ab')
    expect(amountFromLogData(`0x${'00'.repeat(31)}01`)).toBe(1n)
    expect(ERC20_TRANSFER_TOPIC.startsWith('0xddf252ad')).toBe(true)
  })
})
