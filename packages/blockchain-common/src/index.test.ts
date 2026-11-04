import { describe, expect, it } from 'vitest'
import {
  evmNetworkByChainId,
  explorerUrl,
  findTrustedAsset,
  indexingStatus,
  networks,
  parseTrustedTokenList,
  resolveRpcUrl,
  trustedAssets,
  withRpcRetry,
} from './index'

describe('networks', () => {
  it('lists the six supported networks once', () => {
    expect(networks.map((network) => network.caip2)).toEqual([
      'eip155:1',
      'eip155:8453',
      'eip155:11155111',
      'eip155:84532',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    ])
    expect(evmNetworkByChainId(8453)?.name).toBe('Base')
    expect(evmNetworkByChainId(999)).toBeNull()
  })

  it('uses an environment RPC when set and does not invent one in tests', () => {
    const sepolia = evmNetworkByChainId(11155111)
    if (!sepolia) throw new Error('missing sepolia')
    expect(resolveRpcUrl(sepolia, { EVM_RPC_URL_11155111: 'http://127.0.0.1:8545' }, 'test')).toEqual({
      url: 'http://127.0.0.1:8545',
      source: 'environment',
    })
    expect(resolveRpcUrl(sepolia, {}, 'test').url).toBeNull()
    expect(resolveRpcUrl(sepolia, {}, 'production').url).toBeNull()
    expect(resolveRpcUrl(sepolia, {}, 'development').source).toBe('public-development')
  })

  it('builds explorer links and rejects unexpected references', () => {
    const devnet = networks.find((network) => network.cluster === 'devnet')
    if (!devnet) throw new Error('missing devnet')
    expect(explorerUrl(devnet, 'tx', 'abc')).toBe('https://explorer.solana.com/tx/abc?cluster=devnet')
    expect(() => explorerUrl(devnet, 'address', 'ab c')).toThrow(/unsupported/)
  })
})

describe('trusted assets', () => {
  it('marks canonical USDC by address and rejects a bad extra list', () => {
    const assets = trustedAssets('')
    expect(findTrustedAsset(assets, 'eip155:1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')?.symbol).toBe(
      'USDC',
    )
    expect(findTrustedAsset(assets, 'eip155:1', '0x0000000000000000000000000000000000000001')).toBeNull()
    expect(() => parseTrustedTokenList('{')).toThrow(/JSON/)
    expect(() =>
      parseTrustedTokenList(
        JSON.stringify([
          { network: 'eip155:1', kind: 'erc20', symbol: 'FAKE', name: 'Fake', contractAddress: '0xabc', decimals: 6 },
        ]),
      ),
    ).not.toThrow()
  })
})

describe('withRpcRetry', () => {
  it('retries a rate limit and then returns the successful result', async () => {
    let calls = 0
    const value = await withRpcRetry(
      async () => {
        calls += 1
        if (calls < 3) throw new Error('429 rate limit')
        return 'ok'
      },
      async () => undefined,
    )
    expect(value).toBe('ok')
    expect(calls).toBe(3)
  })

  it('does not retry an invalid response', async () => {
    let calls = 0
    await expect(
      withRpcRetry(async () => {
        calls += 1
        throw new Error('invalid block')
      }, async () => undefined),
    ).rejects.toThrow(/invalid block/)
    expect(calls).toBe(1)
  })
})

describe('indexingStatus', () => {
  it('does not claim a connection just because a URL is configured', () => {
    const status = indexingStatus(['eip155:11155111'])
    expect(status.state).toBe('configured')
    expect(status.networks.every((network) => network.connected === false)).toBe(true)
    expect(status.networks.find((network) => network.caip2 === 'eip155:11155111')?.rpcConfigured).toBe(true)
    expect(indexingStatus().state).toBe('not_configured')
  })
})
