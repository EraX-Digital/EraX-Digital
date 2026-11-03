'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, TextArea, TextField } from '@erax/ui'
import { useState } from 'react'
import { api } from '../../../../lib/api'

export default function NewCommunityPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [error, setError] = useState<string | null>(null)

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
      <h1>Create a community</h1>
      <form className="erax-form" onSubmit={(event) => void create(event)}>
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <TextArea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <label className="erax-field">
          <span>Visibility</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit">Create community</Button>
      </form>
    </>
  )
}
