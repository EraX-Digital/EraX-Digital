'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, EmptyState, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type Conversation = {
  id: string
  with: { username: string; displayName: string }
  lastMessage: { body: string; createdAt: string } | null
  unread: boolean
}

export default function MessagesPage() {
  const [items, setItems] = useState<Conversation[] | null>(null)
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const page = await api.conversations()
    setItems(page.items)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Conversations could not be loaded'),
    )
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [])

  async function open(event: React.FormEvent) {
    event.preventDefault()
    try {
      const conversation = await api.openConversation(username)
      window.location.href = `/app/messages/${conversation.id}`
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Conversation was not opened')
    }
  }

  return (
    <>
      <h1>Messages</h1>
      <p className="erax-muted">
        Delivery is request-response with a 10 second refresh. Messages are not end-to-end encrypted.
      </p>
      <form className="erax-form" onSubmit={(event) => void open(event)}>
        <TextField label="Start with a username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <Button type="submit">Open conversation</Button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {items && items.length === 0 ? (
        <EmptyState title="No conversations" body="Start one with a username. Only the two participants can read it." />
      ) : null}
      <ul className="erax-list">
        {items?.map((item) => (
          <li key={item.id}>
            <a href={`/app/messages/${item.id}`}>
              {item.with.displayName} @{item.with.username}
              {item.unread ? ' · unread' : ''}
            </a>
            {item.lastMessage ? <p className="erax-muted">{item.lastMessage.body}</p> : null}
          </li>
        ))}
      </ul>
    </>
  )
}
