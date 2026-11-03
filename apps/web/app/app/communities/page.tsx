'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, EmptyState, TextArea, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type Community = {
  id: string
  name: string
  slug: string
  description: string
  visibility: 'public' | 'private'
  memberCount: number
  viewerRole: string | null
}

export default function CommunitiesPage() {
  const [items, setItems] = useState<Community[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  async function load(q?: string) {
    const page = await api.communities(q)
    setItems(page.items)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Communities could not be loaded'),
    )
  }, [])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    try {
      const created = await api.createCommunity({ name, description, visibility })
      window.location.href = `/app/communities/${created.slug}`
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Community was not created')
    }
  }

  return (
    <>
      <h1>Communities</h1>
      <form className="erax-form erax-card" onSubmit={(event) => void create(event)}>
        <h2>Create a community</h2>
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <TextArea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <label className="erax-field">
          <span>Visibility</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <Button type="submit">Create</Button>
      </form>
      <form
        className="erax-form"
        onSubmit={(event) => {
          event.preventDefault()
          void load(query)
        }}
      >
        <TextField label="Search communities" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {items && items.length === 0 ? (
        <EmptyState title="No communities" body="Create one, or search again. There are no sample communities." />
      ) : null}
      <ul className="erax-list">
        {items?.map((item) => (
          <li key={item.id}>
            <a href={`/app/communities/${item.slug}`}>{item.name}</a>
            <p className="erax-muted">
              {item.visibility} · {item.memberCount} members
              {item.viewerRole ? ` · you are ${item.viewerRole}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
