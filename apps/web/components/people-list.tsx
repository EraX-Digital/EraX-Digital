'use client'

import { Alert, Button, EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type Person = { username: string; displayName: string; avatarUrl: string | null }

export function PeopleList({
  username,
  direction,
}: {
  username: string
  direction: 'followers' | 'following' | 'mutuals'
}) {
  const [items, setItems] = useState<Person[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(cursor?: string) {
    const page =
      direction === 'followers'
        ? await api.followers(username, cursor)
        : direction === 'following'
          ? await api.following(username, cursor)
          : await api.profileMutuals(username, cursor)
    setNextCursor(page.nextCursor)
    setItems((current) => (cursor ? [...(current ?? []), ...page.items] : page.items))
  }

  useEffect(() => {
    setItems(null)
    load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'This list could not be loaded'))
  }, [username, direction])

  const title = direction === 'followers' ? 'Followers' : direction === 'following' ? 'Following' : 'Mutual followers'

  return (
    <section>
      <p>
        <a href={`/app/u/${username}`}>@{username}</a>
      </p>
      <h1>{title}</h1>
      {error ? <Alert>{error}</Alert> : null}
      {items === null && !error ? <p className="erax-muted">Loading…</p> : null}
      {items && items.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()}`} body="This list is empty." />
      ) : null}
      <ul className="erax-list">
        {items?.map((person) => (
          <li key={person.username}>
            <a href={`/app/u/${person.username}`}>
              {person.displayName} <span className="erax-muted">@{person.username}</span>
            </a>
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <Button type="button" onClick={() => void load(nextCursor).catch(() => setError('More people could not be loaded'))}>
          Load more
        </Button>
      ) : null}
    </section>
  )
}
