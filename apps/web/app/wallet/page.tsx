'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type WalletRow = Awaited<ReturnType<typeof api.wallets>>['wallets'][number]
type Balance = Awaited<ReturnType<typeof api.walletBalances>>['balances'][number]

export default function WalletOverviewPage() {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null)
  const [balances, setBalances] = useState<Balance[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const listed = await api.wallets()
      setWallets(listed.wallets)
      const active = listed.wallets.find((wallet) => wallet.preferred && wallet.connected) ?? listed.wallets.find((wallet) => wallet.connected)
      if (!active) {
        setBalances([])
        return
      }
      const result = await api.walletBalances(active.id)
      setBalances(result.balances)
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        setWallets([])
        setBalances([])
        return
      }
      setError(caught instanceof ApiClientError ? caught.message : 'Wallet data could not be loaded')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const active = wallets?.find((wallet) => wallet.preferred && wallet.connected) ?? wallets?.find((wallet) => wallet.connected)

  return (
    <section className="erax-feed">
      <h1>Wallet</h1>
      <p className="erax-muted">Portfolio valuation is unavailable. Amounts below are quantities from the network, not dollar prices.</p>
      {loading ? <p>Loading balances…</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {!loading && wallets?.length === 0 ? (
        <article className="erax-card">
          <h2>Not connected</h2>
          <p>No verified wallet is linked to this account.</p>
          <a className="erax-button" href="/wallet/connect">
            Connect a wallet
          </a>
        </article>
      ) : null}
      {active ? (
        <article className="erax-card">
          <p className="erax-pill">Connected</p>
          <h2>{active.networkName}</h2>
          <p className="erax-address">{active.address}</p>
          <button className="erax-button-secondary" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </article>
      ) : null}
      {balances?.map((balance) => (
        <article className="erax-card" key={`${balance.assetAddress}-${balance.symbol}`}>
          <h2>
            {balance.symbol ?? 'Unknown asset'} {balance.verified ? '' : '(unverified)'}
          </h2>
          <p>{balance.amount ?? `${balance.amountBaseUnits} base units`}</p>
          <p className="erax-muted">{balance.verified ? 'Trusted asset' : 'This token is not in the EraX trusted list.'}</p>
        </article>
      ))}
    </section>
  )
}
