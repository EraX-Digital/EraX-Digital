'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type Balance = Awaited<ReturnType<typeof api.walletBalances>>['balances'][number] & { networkName: string }

export default function AssetsPage() {
  const [rows, setRows] = useState<Balance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const listed = await api.wallets()
        const balances: Balance[] = []
        for (const wallet of listed.wallets.filter((item) => item.connected)) {
          const result = await api.walletBalances(wallet.id)
          for (const balance of result.balances) balances.push({ ...balance, networkName: wallet.networkName })
        }
        if (active) setRows(balances)
      } catch (caught) {
        if (active) setError(caught instanceof ApiClientError ? caught.message : 'Assets could not be loaded')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="erax-feed">
      <h1>Assets</h1>
      <p className="erax-muted">Portfolio valuation is unavailable. Unknown tokens are not shown as verified EraX assets.</p>
      {loading ? <p>Loading balances…</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {!loading && rows.length === 0 ? <p>Not connected. No asset quantities are available.</p> : null}
      {rows.map((row) => (
        <article className="erax-card" key={`${row.networkName}-${row.assetAddress}-${row.symbol}`}>
          <h2>{row.symbol ?? 'Unknown asset'}</h2>
          <p>{row.amount ?? `${row.amountBaseUnits} base units`}</p>
          <p className="erax-muted">
            {row.networkName} · {row.verified ? 'Trusted asset' : 'Unverified'} · decimals {row.decimals ?? 'unavailable'}
          </p>
          {row.assetAddress ? <p className="erax-address">{row.assetAddress}</p> : <p>Native coin</p>}
        </article>
      ))}
    </section>
  )
}
