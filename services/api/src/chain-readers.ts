import { networks, resolveRpcUrl } from '@erax/blockchain-common'
import type { Env } from '@erax/config'
import { createViemReader, type EvmReader } from '@erax/wallet-evm'
import { createSolanaReader, type SolanaReader } from '@erax/wallet-solana'

export type ChainReaders = {
  evm: Record<string, EvmReader>
  solana: Record<string, SolanaReader>
}

export function createChainReaders(env: Env): ChainReaders {
  const readers: ChainReaders = { evm: {}, solana: {} }
  for (const network of networks) {
    const resolved = resolveRpcUrl(network, env, env.NODE_ENV)
    if (!resolved.url) continue
    if (network.family === 'evm' && network.chainId !== null) {
      readers.evm[network.caip2] = createViemReader(resolved.url, network.chainId)
    }
    if (network.family === 'solana') {
      readers.solana[network.caip2] = createSolanaReader(resolved.url)
    }
  }
  return readers
}
