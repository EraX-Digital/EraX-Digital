'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { createContext, useContext, useMemo, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../lib/wagmi-config'

const queryClient = new QueryClient()

const EndpointContext = createContext<{
  endpoint: string
  setEndpoint: (endpoint: string) => void
} | null>(null)

export function useSolanaEndpoint() {
  const value = useContext(EndpointContext)
  if (!value) throw new Error('Solana endpoint is unavailable')
  return value
}

export const SOLANA_DEVNET =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET?.trim() || 'https://api.devnet.solana.com'
export const SOLANA_MAINNET =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET?.trim() || 'https://api.mainnet-beta.solana.com'

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const [endpoint, setEndpoint] = useState(SOLANA_DEVNET)
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <EndpointContext.Provider value={{ endpoint, setEndpoint }}>{children}</EndpointContext.Provider>
          </WalletProvider>
        </ConnectionProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
