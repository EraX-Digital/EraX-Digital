import { describe, expect, it } from 'vitest'
import { toFunctionSelector } from 'viem'
import {
  buildCreatorMetadataUpdate,
  buildCreatorRegistration,
  buildCreatorTip,
  creatorCalldataSelector,
} from './creator-contracts'

const registry = '0x1111111111111111111111111111111111111111'
const tipping = '0x2222222222222222222222222222222222222222'
const creator = '0x3333333333333333333333333333333333333333'

describe('creator contract calls', () => {
  it('builds a registration call for an explicit chain and registry', () => {
    const transaction = buildCreatorRegistration({
      chainId: 11155111,
      registry,
      metadataUri: 'ipfs://alice',
    })
    expect(transaction.chainId).toBe(11155111)
    expect(transaction.to).toBe(registry)
    expect(transaction.value).toBe(0n)
    expect(creatorCalldataSelector(transaction.data)).toBe(toFunctionSelector('register(string)'))
  })

  it('builds a metadata update without moving ETH', () => {
    const transaction = buildCreatorMetadataUpdate({
      chainId: 84532,
      registry,
      metadataUri: 'https://metadata.example/alice.json',
    })
    expect(transaction.chainId).toBe(84532)
    expect(creatorCalldataSelector(transaction.data)).toBe(toFunctionSelector('updateMetadata(string)'))
    expect(transaction.value).toBe(0n)
  })

  it('builds an ETH tip that the connected wallet must approve', () => {
    const transaction = buildCreatorTip({
      chainId: 84532,
      tipping,
      creator,
      amountBaseUnits: 400000000000000000n,
    })
    expect(transaction.to).toBe(tipping)
    expect(transaction.value).toBe(400000000000000000n)
    expect(creatorCalldataSelector(transaction.data)).toBe(toFunctionSelector('tip(address)'))
  })

  it('rejects a missing deployment and a zero tip', () => {
    expect(() =>
      buildCreatorRegistration({ chainId: 1, registry: '0x0000000000000000000000000000000000000000', metadataUri: 'ipfs://a' }),
    ).toThrow(/not a deployed contract/)
    expect(() =>
      buildCreatorTip({ chainId: 1, tipping, creator, amountBaseUnits: 0n }),
    ).toThrow(/greater than zero/)
  })
})
