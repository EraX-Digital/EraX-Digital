'use client'

import { WalletFrame } from '../../components/wallet-frame'
import { WalletProviders } from '../../components/wallet-providers'

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <WalletFrame>{children}</WalletFrame>
    </WalletProviders>
  )
}
