'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, TextField } from '@erax/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '../../lib/api'

export default function AdminLoginPage() {
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
      const session = await api.me()
      if (session.user.role !== 'admin') {
        await api.logout()
        setError('This account is not an administrator.')
        return
      }
      router.push('/')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Sign-in failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark href="/login" label="Administration" />
      </header>
      <section className="erax-panel">
        <h1>Administrator sign-in</h1>
        <p className="erax-muted">Ordinary member accounts are rejected here and on the API.</p>
        <form className="erax-form" onSubmit={onSubmit}>
          <TextField label="Email" name="email" type="email" autoComplete="username" required />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  )
}
