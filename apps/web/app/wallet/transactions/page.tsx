'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type Row = Awaited<ReturnType<typeof api.walletTransactions>>['transactions'][number]

export default function TransactionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [coverage, setCoverage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(next?: string) {
    setLoading(true)
    setError(null)
    try {
      const page = await api.walletTransactions(next)
      setRows((current) => (next ? [...current, ...page.transactions] : page.transactions))
      setCursor(page.nextCursor)
      setCoverage(page.coverage)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Transactions could not be loaded')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function refresh(id: string) {
    setError(null)
    try {
      const result = await api.refreshTransaction(id)
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: result.transaction.status } : row)))
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The chain status could not be read')
    }
  }

  return (
    <section className="erax-feed">
      <h1>Activity</h1>
      <p className="erax-muted">{coverage || 'Transaction history has not been loaded.'}</p>
      {loading && rows.length === 0 ? <p>Loading transactions…</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {!loading && rows.length === 0 ? <p>No EraX or indexed transactions are stored for the linked wallets.</p> : null}
      {rows.map((row) => (
        <article className="erax-card" key={row.id}>
          <p className="erax-pill">{row.status}</p>
          <h2>
            {row.assetSymbol} · {row.amountBaseUnits} base units
          </h2>
          <p className="erax-muted">
            {row.network} · {row.source === 'erax' ? 'Submitted in EraX' : 'Discovered on chain'} · fee {row.feeBaseUnits ?? 'unavailable'}
          </p>
          <p className="erax-address">From {row.sender}</p>
          <p className="erax-address">To {row.recipient}</p>
          <p className="erax-address">{row.hash}</p>
          <div className="erax-actions">
            <button className="erax-button-secondary" type="button" onClick={() => void refresh(row.id)}>
              Refresh status
            </button>
            {row.explorerUrl ? (
              <a href={row.explorerUrl} target="_blank" rel="noreferrer">
                Explorer
              </a>
            ) : null}
          </div>
        </article>
      ))}
      {cursor ? (
        <button className="erax-button" type="button" onClick={() => void load(cursor)}>
          Load more
        </button>
      ) : null}
    </section>
  )
}
