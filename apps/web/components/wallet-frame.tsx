'use client'

import { BrandMark } from '@erax/ui'

const links = [
  ['/wallet', 'Overview'],
  ['/wallet/connect', 'Connect'],
  ['/wallet/assets', 'Assets'],
  ['/wallet/receive', 'Receive'],
  ['/wallet/send', 'Send'],
  ['/wallet/transactions', 'Activity'],
  ['/wallet/creator', 'Creator'],
]

export function WalletFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="erax-social">
      <aside className="erax-side">
        <BrandMark href="/wallet" label="Wallet" />
        <nav className="erax-side-nav">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <a href="/app">Social</a>
          <a href="/about">About</a>
          <a href="https://erax.digital/" target="_blank" rel="noopener noreferrer">
            EraX Digital
          </a>
        </nav>
        <p className="erax-muted">EraX never asks for a seed phrase or private key.</p>
      </aside>
      <main className="erax-main">{children}</main>
      <nav className="erax-bottom-nav">
        <a href="/wallet">Wallet</a>
        <a href="/wallet/connect">Connect</a>
        <a href="/wallet/send">Send</a>
        <a href="/wallet/receive">Receive</a>
        <a href="/app">Social</a>
      </nav>
    </div>
  )
}
