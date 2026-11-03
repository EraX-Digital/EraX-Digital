'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, Note, TextField } from '@erax/ui'
import { useState } from 'react'
import { api } from '../../lib/api'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [delivery, setDelivery] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(event.currentTarget)
    const nextEmail = String(form.get('email') ?? '')
    setEmail(nextEmail)
    try {
      const result = await api.register({
        email: nextEmail,
        password: String(form.get('password') ?? ''),
        username: String(form.get('username') ?? ''),
        displayName: String(form.get('displayName') ?? '') || undefined,
      })
      if (result.emailDelivery.delivered) {
        setDelivery('A verification message was sent through SMTP.')
      } else if (result.emailDelivery.transport === 'development-outbox') {
        setDelivery(
          'The account exists, but no email was sent. The verification message is in the local development outbox.',
        )
      } else {
        setDelivery(
          `The account exists, but email was not delivered. ${result.emailDelivery.reason}`,
        )
      }
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Registration failed')
    } finally {
      setPending(false)
    }
  }

  async function loadOutbox() {
    setError(null)
    try {
      const box = await api.outbox(email)
      setCaptured(box.messages[0]?.text ?? 'No captured message was found for that address.')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The outbox could not be read')
    }
  }

  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
        <a href="/login">Sign in</a>
      </header>
      <section className="erax-panel">
        <h1>Create an account</h1>
        <p className="erax-muted">
          Passwords are hashed with Argon2id. A wallet address is not an account.
        </p>
        <form className="erax-form" onSubmit={onSubmit}>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
          />
          <TextField
            label="Display name"
            name="displayName"
            autoComplete="nickname"
            maxLength={50}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          {error ? <Alert>{error}</Alert> : null}
          {delivery ? <Note>{delivery}</Note> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        {delivery?.includes('outbox') ? (
          <div className="erax-form" style={{ marginTop: 16 }}>
            <Button type="button" onClick={() => void loadOutbox()}>
              Show captured verification message
            </Button>
            {captured ? <pre className="erax-pre">{captured}</pre> : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}
