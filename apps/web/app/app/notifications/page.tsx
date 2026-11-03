'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { notificationLabel } from '../../../lib/view-model'

type Note = {
  id: string
  type: string
  read: boolean
  createdAt: string
  targetId: string | null
  actor: { username: string; displayName: string } | null
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const page = await api.notifications()
    setItems(page.items)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Notifications could not be loaded'),
    )
  }, [])

  async function read(id: string) {
    try {
      await api.markNotification(id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not mark that notification')
    }
  }

  return (
    <>
      <h1>Notifications</h1>
      <Button
        type="button"
        onClick={() =>
          void api
            .markAllNotifications()
            .then(load)
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : 'Could not mark notifications'),
            )
        }
      >
        Mark all as read
      </Button>
      {error ? <Alert>{error}</Alert> : null}
      {items === null ? <p className="erax-muted">Loading notifications…</p> : null}
      {items && items.length === 0 ? (
        <EmptyState title="No notifications" body="Follows, likes, comments, replies, and messages will show up here." />
      ) : null}
      <ul className="erax-list">
        {items?.map((item) => (
          <li key={item.id}>
            <p>{notificationLabel(item.type, item.actor?.displayName ?? '')}</p>
            <p className="erax-muted">
              {new Date(item.createdAt).toLocaleString()} · {item.read ? 'read' : 'unread'}
            </p>
            {item.type === 'community_invite' && item.targetId ? (
              <Button type="button" onClick={() => void api.acceptInvite(item.targetId!).then(load)}>
                Accept invitation
              </Button>
            ) : null}
            {item.read ? null : (
              <button type="button" onClick={() => void read(item.id)}>
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
