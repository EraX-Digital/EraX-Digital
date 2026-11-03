'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, TextArea } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'

type Message = { id: string; body: string; createdAt: string; mine: boolean; sender: { username: string } }

export default function ConversationPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [items, setItems] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const page = await api.messages(id)
    setItems(page.items)
    await api.markConversationRead(id)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Messages could not be loaded'),
    )
    const timer = window.setInterval(() => {
      api
        .messages(id)
        .then((page) => setItems(page.items))
        .catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [id])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    try {
      await api.sendMessage(id, body)
      setBody('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Message was not sent')
    }
  }

  return (
    <>
      <h1>Conversation</h1>
      {error ? <Alert>{error}</Alert> : null}
      <ul className="erax-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.mine ? 'You' : item.sender.username}</strong>
            <p>{item.body}</p>
            <p className="erax-muted">{new Date(item.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
      <form className="erax-form" onSubmit={(event) => void send(event)}>
        <TextArea label="Message" value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
        <Button type="submit">Send</Button>
      </form>
    </>
  )
}
