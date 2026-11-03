'use client'

import { ApiClientError } from '@erax/api-client'
import { EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { AdminShell } from '../admin-shell'
import { api } from '../../lib/api'

type Entry = Awaited<ReturnType<typeof api.auditLogs>>['entries'][number]

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .auditLogs()
      .then((result) => setEntries(result.entries))
      .catch((caught: unknown) => {
        if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403))
          return
        setError(caught instanceof Error ? caught.message : 'Audit log could not be loaded')
      })
  }, [])

  return (
    <main className="erax-shell">
      <AdminShell>
        <h1>Audit log</h1>
        {error ? <p role="alert">{error}</p> : null}
        {entries && entries.length === 0 ? (
          <EmptyState
            title="No audit events"
            body="Actions such as registration, login, and suspension will appear here."
          />
        ) : null}
        {entries && entries.length > 0 ? (
          <table className="erax-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.createdAt}</td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.targetType} {entry.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminShell>
    </main>
  )
}
