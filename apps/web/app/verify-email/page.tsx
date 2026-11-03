'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, Note } from '@erax/ui'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { api } from '../../lib/api'

function VerifyForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function verify() {
    setPending(true)
    setError(null)
    try {
      await api.verifyEmail(token)
      setMessage('Email verified. You can sign in.')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Verification failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="erax-panel">
      <h1>Verify email</h1>
      {!token ? <Alert>Open the verification link from your message to continue.</Alert> : null}
      {message ? <Note>{message}</Note> : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="erax-actions">
        <Button
          type="button"
          onClick={() => void verify()}
          disabled={!token || pending || Boolean(message)}
        >
          {pending ? 'Verifying…' : 'Verify email'}
        </Button>
        <a href="/login">Sign in</a>
      </div>
    </section>
  )
}

export default function VerifyEmailPage() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
      </header>
      <Suspense fallback={<p className="erax-muted">Loading verification…</p>}>
        <VerifyForm />
      </Suspense>
    </main>
  )
}
