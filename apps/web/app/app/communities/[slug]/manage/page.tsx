'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, TextArea, TextField } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../../../../../lib/api'

export default function ManageCommunityPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [member, setMember] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .community(slug)
      .then((community) => {
        setName(community.name)
        setDescription(community.description)
        setRules(community.rules ?? '')
        setVisibility(community.visibility)
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Community could not be loaded'),
      )
  }, [slug])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)
    try {
      await api.updateCommunity(slug, { name, description, rules, visibility })
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Community was not updated')
    }
  }

  return (
    <>
      <h1>Manage community</h1>
      {error ? <Alert>{error}</Alert> : null}
      <form className="erax-form" onSubmit={(event) => void save(event)}>
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <TextArea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <TextArea label="Rules" value={rules} maxLength={2000} onChange={(event) => setRules(event.target.value)} />
        <label className="erax-field">
          <span>Visibility</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <Button type="submit">Save</Button>
        {saved ? <p className="erax-note">Saved.</p> : null}
      </form>
      <form
        className="erax-form"
        onSubmit={(event) => {
          event.preventDefault()
          void api.setRole(slug, member, 'moderator').catch((caught: unknown) =>
            setError(caught instanceof ApiClientError ? caught.message : 'Role was not changed'),
          )
        }}
      >
        <TextField label="Make this member a moderator" value={member} onChange={(event) => setMember(event.target.value)} />
        <Button type="submit">Update role</Button>
      </form>
    </>
  )
}
