'use client'

import { ApiClientError } from '@erax/api-client'
import { EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { AdminShell } from './admin-shell'
import { api } from '../lib/api'

export default function DashboardPage() {
  const [summary, setSummary] = useState<{ userCount: number; auditCount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .adminSummary()
      .then(setSummary)
      .catch((caught: unknown) => {
        if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403))
          return
        setError(caught instanceof Error ? caught.message : 'Summary failed')
      })
  }, [])

  return (
    <main className="erax-shell">
      <AdminShell>
        <h1>Dashboard</h1>
        {error ? <p role="alert">{error}</p> : null}
        {!summary && !error ? <p className="erax-muted">Loading counts…</p> : null}
        {summary && summary.userCount === 0 && summary.auditCount === 0 ? (
          <EmptyState
            title="No records yet"
            body="There are no users or audit events in the database."
          />
        ) : null}
        {summary && (summary.userCount > 0 || summary.auditCount > 0) ? (
          <section className="erax-grid">
            <article className="erax-card">
              <h2>Users</h2>
              <p>{summary.userCount}</p>
            </article>
            <article className="erax-card">
              <h2>Audit events</h2>
              <p>{summary.auditCount}</p>
            </article>
          </section>
        ) : null}
      </AdminShell>
    </main>
  )
}
