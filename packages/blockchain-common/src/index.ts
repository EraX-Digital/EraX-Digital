export type ChainEnvironment = 'mainnet' | 'testnet'
export type ChainFamily = 'evm' | 'solana'

export type NetworkDefinition = {
  family: ChainFamily
  caip2: string
  name: string
  chainId: number | null
  cluster: 'mainnet-beta' | 'devnet' | null
  nativeSymbol: string
  nativeName: string
  nativeDecimals: number
  environment: ChainEnvironment
  explorerTx: string
  explorerAddress: string
  publicRpcUrl: string
  rpcEnv: string
}

export type TrustedAsset = {
  network: string
  kind: 'native' | 'erc20' | 'spl' | 'token2022'
  symbol: string
  name: string
  contractAddress: string
  decimals: number
}

export const networks: NetworkDefinition[] = [
  {
    family: 'evm',
    caip2: 'eip155:1',
    name: 'Ethereum',
    chainId: 1,
    cluster: null,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    environment: 'mainnet',
    explorerTx: 'https://etherscan.io/tx/',
    explorerAddress: 'https://etherscan.io/address/',
    publicRpcUrl: 'https://ethereum.publicnode.com',
    rpcEnv: 'EVM_RPC_URL_1',
  },
  {
    family: 'evm',
    caip2: 'eip155:8453',
    name: 'Base',
    chainId: 8453,
    cluster: null,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    environment: 'mainnet',
    explorerTx: 'https://basescan.org/tx/',
    explorerAddress: 'https://basescan.org/address/',
    publicRpcUrl: 'https://mainnet.base.org',
    rpcEnv: 'EVM_RPC_URL_8453',
  },
  {
    family: 'evm',
    caip2: 'eip155:11155111',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    cluster: null,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    environment: 'testnet',
    explorerTx: 'https://sepolia.etherscan.io/tx/',
    explorerAddress: 'https://sepolia.etherscan.io/address/',
    publicRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    rpcEnv: 'EVM_RPC_URL_11155111',
  },
  {
    family: 'evm',
    caip2: 'eip155:84532',
    name: 'Base Sepolia',
    chainId: 84532,
    cluster: null,
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    environment: 'testnet',
    explorerTx: 'https://sepolia.basescan.org/tx/',
    explorerAddress: 'https://sepolia.basescan.org/address/',
    publicRpcUrl: 'https://sepolia.base.org',
    rpcEnv: 'EVM_RPC_URL_84532',
  },
  {
    family: 'solana',
    caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    name: 'Solana',
    chainId: null,
    cluster: 'mainnet-beta',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    nativeDecimals: 9,
    environment: 'mainnet',
    explorerTx: 'https://explorer.solana.com/tx/',
    explorerAddress: 'https://explorer.solana.com/address/',
    publicRpcUrl: 'https://api.mainnet-beta.solana.com',
    rpcEnv: 'SOLANA_RPC_URL_MAINNET',
  },
  {
    family: 'solana',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    name: 'Solana Devnet',
    chainId: null,
    cluster: 'devnet',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    nativeDecimals: 9,
    environment: 'testnet',
    explorerTx: 'https://explorer.solana.com/tx/',
    explorerAddress: 'https://explorer.solana.com/address/',
    publicRpcUrl: 'https://api.devnet.solana.com',
    rpcEnv: 'SOLANA_RPC_URL_DEVNET',
  },
]

export const plannedNetworks = networks.map((network) => ({
  family: network.family,
  caip2: network.caip2,
  name: network.name,
}))

const USDC_ETHEREUM = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

export const builtInTrustedAssets: TrustedAsset[] = [
  ...networks.map((network) => ({
    network: network.caip2,
    kind: 'native' as const,
    symbol: network.nativeSymbol,
    name: network.nativeName,
    contractAddress: '',
    decimals: network.nativeDecimals,
  })),
  {
    network: 'eip155:1',
    kind: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    contractAddress: USDC_ETHEREUM,
    decimals: 6,
  },
  {
    network: 'eip155:8453',
    kind: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    contractAddress: USDC_BASE,
    decimals: 6,
  },
]

export function networkByCaip2(caip2: string): NetworkDefinition | null {
  return networks.find((network) => network.caip2 === caip2) ?? null
}

export function evmNetworkByChainId(chainId: number): NetworkDefinition | null {
  return networks.find((network) => network.chainId === chainId) ?? null
}

export function resolveRpcUrl(
  network: NetworkDefinition,
  env: object,
  nodeEnv: string,
): { url: string | null; source: 'environment' | 'public-development' | 'not_configured' } {
  const raw = (env as Record<string, unknown>)[network.rpcEnv]
  const explicit = typeof raw === 'string' ? raw.trim() : ''
  if (explicit.length > 0) return { url: explicit, source: 'environment' }
  if (nodeEnv === 'development') return { url: network.publicRpcUrl, source: 'public-development' }
  return { url: null, source: 'not_configured' }
}

export function parseTrustedTokenList(json: string): TrustedAsset[] {
  if (json.trim().length === 0) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    throw new Error('TRUSTED_TOKEN_LIST_JSON is not valid JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('TRUSTED_TOKEN_LIST_JSON must be an array')
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Trusted token ${index} is not an object`)
    }
    const row = entry as Record<string, unknown>
    const network = networkByCaip2(String(row.network ?? ''))
    const kind = row.kind
    const decimals = row.decimals
    const contractAddress = String(row.contractAddress ?? '').trim().toLowerCase()
    if (!network) throw new Error(`Trusted token ${index} uses an unknown network`)
    if (kind !== 'erc20' && kind !== 'spl' && kind !== 'token2022') {
      throw new Error(`Trusted token ${index} has an unsupported kind`)
    }
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      throw new Error(`Trusted token ${index} has invalid decimals`)
    }
    if (contractAddress.length === 0) throw new Error(`Trusted token ${index} needs a contract address`)
    const symbol = String(row.symbol ?? '').trim()
    const name = String(row.name ?? '').trim()
    if (symbol.length === 0 || symbol.length > 32 || name.length === 0 || name.length > 64) {
      throw new Error(`Trusted token ${index} has an invalid name or symbol`)
    }
    return {
      network: network.caip2,
      kind,
      symbol,
      name,
      contractAddress,
      decimals,
    }
  })
}

export function trustedAssets(extraJson = ''): TrustedAsset[] {
  return [...builtInTrustedAssets, ...parseTrustedTokenList(extraJson)]
}

export function findTrustedAsset(assets: TrustedAsset[], network: string, contractAddress: string) {
  const key = contractAddress.trim().toLowerCase()
  return assets.find((asset) => asset.network === network && asset.contractAddress === key) ?? null
}

const SAFE_REFERENCE = /^[A-Za-z0-9]+$/

export function explorerUrl(network: NetworkDefinition, kind: 'tx' | 'address', reference: string): string {
  if (!SAFE_REFERENCE.test(reference)) throw new Error('Explorer reference contains unsupported characters')
  const base = kind === 'tx' ? network.explorerTx : network.explorerAddress
  const cluster = network.cluster === 'devnet' ? '?cluster=devnet' : ''
  return `${base}${reference}${cluster}`
}

export type IndexingNetworkStatus = {
  family: ChainFamily
  caip2: string
  name: string
  rpcConfigured: boolean
  connected: false
}

export async function withRpcRetry<T>(
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  const delays = [0, 250, 1000]
  let last: unknown
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0
    if (delay > 0) await sleep(delay)
    try {
      return await operation()
    } catch (error) {
      last = error
      const message = error instanceof Error ? error.message : ''
      const retryable = /429|rate.?limit|timeout|fetch|network|ECONN|503|502/i.test(message)
      if (!retryable || attempt === delays.length - 1) throw error
    }
  }
  throw last
}

export function indexingStatus(rpcConfigured: string[] = []) {
  const configured = new Set(rpcConfigured)
  const listed: IndexingNetworkStatus[] = networks.map((network) => ({
    family: network.family,
    caip2: network.caip2,
    name: network.name,
    rpcConfigured: configured.has(network.caip2),
    connected: false,
  }))
  return {
    state: configured.size > 0 ? ('configured' as const) : ('not_configured' as const),
    coverage:
      'Indexing starts at the current chain head. Older history is not backfilled. A configured RPC is not treated as connected until a checkpoint is saved.',
    networks: listed,
  }
}
