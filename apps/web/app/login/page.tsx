'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, TextField } from '@erax/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      await api.login(String(form.get('email') ?? ''), String(form.get('password') ?? ''))
      router.push('/app')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Sign-in failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
        <a href="/register">Create account</a>
      </header>
      <section className="erax-panel">
        <h1>Sign in</h1>
        <form className="erax-form" onSubmit={onSubmit}>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? <Alert>{error}</Alert> : null}
          <div className="erax-actions">
            <Button type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
            <a href="/forgot-password">Forgot password</a>
            <a href="/wallet/connect">Sign in with a wallet</a>
          </div>
        </form>
      </section>
    </main>
  )
}
