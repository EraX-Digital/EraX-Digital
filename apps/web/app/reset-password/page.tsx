'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, Note, TextField } from '@erax/ui'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { api } from '../../lib/api'

function ResetForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api.resetPassword(
        token,
        String(new FormData(event.currentTarget).get('password') ?? ''),
      )
      setDone(true)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Reset failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="erax-panel">
      <h1>Choose a new password</h1>
      {!token ? <Alert>This page needs a reset token from your message.</Alert> : null}
      {done ? <Note>Password updated. Sign in with the new password.</Note> : null}
      <form className="erax-form" onSubmit={onSubmit}>
        <TextField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" disabled={pending || !token || done}>
          {pending ? 'Saving…' : 'Update password'}
        </Button>
      </form>
      <p>
        <a href="/login">Sign in</a>
      </p>
    </section>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
      </header>
      <Suspense fallback={<p className="erax-muted">Loading reset form…</p>}>
        <ResetForm />
      </Suspense>
    </main>
  )
}
