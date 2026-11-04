'use client'

import { ApiClientError } from '@erax/api-client'
import type { PublicProfile, SocialLink } from '@erax/shared-types'
import { Alert, Button, Note, TextArea, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

export default function ProfilePage() {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [links, setLinks] = useState<SocialLink[]>([])

  useEffect(() => {
    api
      .me()
      .then((result) => {
        setProfile(result.profile)
        setLinks(result.profile.socialLinks)
      })
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
      const result = await api.updateProfile({
        username: String(form.get('username') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        bio: String(form.get('bio') ?? ''),
        website: String(form.get('website') ?? ''),
        location: String(form.get('location') ?? ''),
        visibility: String(form.get('visibility') ?? 'public') as 'public' | 'private',
        creatorStatus: String(form.get('creatorStatus') ?? 'none') as 'none' | 'creator',
        socialLinks: links.filter((link) => link.label.trim() && link.url.trim()),
      })
      setProfile(result.profile)
      setLinks(result.profile.socialLinks)
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
        {links.map((link, index) => (
          <div key={index} className="erax-form">
            <TextField
              label={`Link ${index + 1} label`}
              value={link.label}
              maxLength={30}
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)),
                )
              }
            />
            <TextField
              label={`Link ${index + 1} URL`}
              value={link.url}
              placeholder="https://"
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, url: event.target.value } : item)),
                )
              }
            />
          </div>
        ))}
        {links.length < 5 ? (
          <button className="erax-button-secondary" type="button" onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}>
            Add social link
          </button>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {saved ? <Note>Profile saved.</Note> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
        <a href={`/app/u/${profile.username}`}>View public profile</a>
      </form>
      <form
        className="erax-form"
        onSubmit={(event) => {
          event.preventDefault()
          const file = new FormData(event.currentTarget).get('avatar')
          if (!(file instanceof File) || file.size === 0) return
          setError(null)
          void api
            .uploadAvatar(file)
            .then(() => setSaved(true))
            .catch((caught: unknown) =>
              setError(caught instanceof ApiClientError ? caught.message : 'Avatar was not saved'),
            )
        }}
      >
        <label className="erax-field">
          <span>Avatar</span>
          <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </label>
        <Button type="submit">Upload avatar</Button>
      </form>
      <form
        className="erax-form"
        onSubmit={(event) => {
          event.preventDefault()
          const file = new FormData(event.currentTarget).get('cover')
          if (!(file instanceof File) || file.size === 0) return
          setError(null)
          void api
            .uploadCover(file)
            .then(() => setSaved(true))
            .catch((caught: unknown) =>
              setError(caught instanceof ApiClientError ? caught.message : 'Cover was not saved'),
            )
        }}
      >
        <label className="erax-field">
          <span>Cover</span>
          <input name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        </label>
        <Button type="submit">Upload cover</Button>
        <p className="erax-muted">
          If this deployment has no media storage, the upload stops with an error and nothing is pretended to
          be saved.
        </p>
      </form>
      <p className="erax-muted">
        Linked wallets are verified by a signature. Manage them on the <a href="/wallet">wallet page</a>.
        Self-declared creator status is not a verification badge and is not an on-chain registration.
      </p>
    </section>
  )
}
