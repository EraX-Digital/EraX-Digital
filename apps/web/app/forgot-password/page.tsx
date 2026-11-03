'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, BrandMark, Button, Note, TextField } from '@erax/ui'
import { useState } from 'react'
import { api } from '../../lib/api'

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const nextEmail = String(new FormData(event.currentTarget).get('email') ?? '')
    setEmail(nextEmail)
    try {
      const result = await api.forgotPassword(nextEmail)
      setMessage(result.message)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The request failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="erax-shell">
      <header className="erax-header">
        <BrandMark />
      </header>
      <section className="erax-panel">
        <h1>Reset password</h1>
        <form className="erax-form" onSubmit={onSubmit}>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          {error ? <Alert>{error}</Alert> : null}
          {message ? <Note>{message}</Note> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Requesting…' : 'Request reset'}
          </Button>
        </form>
        {message?.includes('outbox') ? (
          <div className="erax-form" style={{ marginTop: 16 }}>
            <Button
              type="button"
              onClick={() =>
                void api
                  .outbox(email)
                  .then((box) =>
                    setCaptured(box.messages[0]?.text ?? 'No captured message for that address.'),
                  )
              }
            >
              Show captured reset message
            </Button>
            {captured ? <pre className="erax-pre">{captured}</pre> : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}
