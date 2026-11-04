'use client'

import { createConfig, http } from 'wagmi'
import { base, baseSepolia, mainnet, sepolia } from 'wagmi/chains'
import { coinbaseWallet, injected, metaMask, walletConnect } from 'wagmi/connectors'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()

export const wagmiConfig = createConfig({
  chains: [sepolia, baseSepolia, mainnet, base],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: 'EraX' }),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
})

export const walletConnectConfigured = Boolean(projectId)
