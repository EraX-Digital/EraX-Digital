'use client'

import { ApiClientError } from '@erax/api-client'
import { BrandMark } from '@erax/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((session) => {
        if (!active) return
        if (session.user.role !== 'admin') {
          router.replace('/login')
          return
        }
        setReady(true)
      })
      .catch((caught: unknown) => {
        if (!active) return
        if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403)) {
          router.replace('/login')
          return
        }
        setError(caught instanceof Error ? caught.message : 'Administration could not be loaded')
      })
    return () => {
      active = false
    }
  }, [router])

  if (error) return <p role="alert">{error}</p>
  if (!ready) return <p className="erax-muted">Checking administrator session…</p>

  return (
    <>
      <header className="erax-header">
        <BrandMark href="/" label="Administration" />
        <nav className="erax-nav">
          <a href="/">Dashboard</a>
          <a href="/users">Users</a>
          <a href="/audit">Audit log</a>
          <button
            className="erax-button-secondary"
            type="button"
            onClick={() => void api.logout().then(() => router.replace('/login'))}
          >
            Log out
          </button>
        </nav>
      </header>
      {children}
    </>
  )
}
