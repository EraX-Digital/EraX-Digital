'use client'

import { ApiClientError } from '@erax/api-client'
import type { PublicProfile } from '@erax/shared-types'
import { Alert, Button, Note, TextArea, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

export default function ProfilePage() {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((result) => setProfile(result.profile))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Profile could not be loaded')
      })
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setPending(true)
    setSaved(false)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const linkLabel = String(form.get('linkLabel') ?? '').trim()
      const linkUrl = String(form.get('linkUrl') ?? '').trim()
      const result = await api.updateProfile({
        username: String(form.get('username') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        bio: String(form.get('bio') ?? ''),
        website: String(form.get('website') ?? ''),
        location: String(form.get('location') ?? ''),
        visibility: String(form.get('visibility') ?? 'public') as 'public' | 'private',
        creatorStatus: String(form.get('creatorStatus') ?? 'none') as 'none' | 'creator',
        socialLinks: linkLabel && linkUrl ? [{ label: linkLabel, url: linkUrl }] : profile.socialLinks,
      })
      setProfile(result.profile)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Profile update failed')
    } finally {
      setPending(false)
    }
  }

  if (!profile && !error) return <p className="erax-muted">Loading profile…</p>
  if (!profile) return <Alert>{error}</Alert>

  return (
    <section className="erax-panel">
      <h1>Profile</h1>
      <form className="erax-form" onSubmit={onSubmit}>
        <TextField
          label="Username"
          name="username"
          defaultValue={profile.username}
          required
          minLength={3}
          maxLength={20}
        />
        <TextField
          label="Display name"
          name="displayName"
          defaultValue={profile.displayName}
          required
          maxLength={50}
        />
        <TextArea label="Bio" name="bio" defaultValue={profile.bio} maxLength={280} rows={4} />
        <TextField
          label="Website"
          name="website"
          defaultValue={profile.website ?? ''}
          placeholder="https://"
        />
        <TextField label="Location" name="location" defaultValue={profile.location ?? ''} maxLength={80} />
        <label className="erax-field">
          <span>Visibility</span>
          <select name="visibility" defaultValue={profile.visibility}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="erax-field">
          <span>Creator status</span>
          <select name="creatorStatus" defaultValue={profile.creatorStatus}>
            <option value="none">Not a creator</option>
            <option value="creator">Self-declared creator</option>
          </select>
        </label>
        <TextField label="Social link label" name="linkLabel" />
        <TextField label="Social link URL" name="linkUrl" placeholder="https://" />
        {error ? <Alert>{error}</Alert> : null}
        {saved ? <Note>Profile saved.</Note> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
        <a href={`/app/u/${profile.username}`}>View public profile</a>
      </form>
      <p className="erax-muted">
        Linked wallets are verified by a signature. Manage them on the <a href="/wallet">wallet page</a>.
      </p>
    </section>
  )
}
