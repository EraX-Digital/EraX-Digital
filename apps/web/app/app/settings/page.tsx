'use client'

import { ApiClientError } from '@erax/api-client'
import type { PublicUser } from '@erax/shared-types'
import { Alert, Button, Note, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

export default function SettingsPage() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((result) => {
        setUser(result.user)
        setAvatarUrl(result.profile.avatarUrl)
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Settings could not be loaded'),
      )
  }, [])

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const result = await api.uploadAvatar(file)
      setAvatarUrl(result.avatarUrl)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Upload failed')
    } finally {
      setPending(false)
    }
  }

  if (!user && !error) return <p className="erax-muted">Loading settings…</p>

  return (
    <section className="erax-panel">
      <h1>Settings</h1>
      {error ? <Alert>{error}</Alert> : null}
      {user ? (
        <>
          <p>Email: {user.email}</p>
          <p className="erax-muted">
            Verification:{' '}
            {user.emailVerifiedAt ? `verified ${user.emailVerifiedAt}` : 'not verified'}
          </p>
          <p className="erax-muted">Role: {user.role}</p>
          {avatarUrl ? (
            <img alt="" src={avatarUrl} width={72} height={72} />
          ) : (
            <p className="erax-muted">No avatar stored.</p>
          )}
          <label className="erax-field">
            <span>Avatar image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void onFile(event)}
            />
          </label>
          {pending ? <Note>Uploading…</Note> : null}
          <p>
            <a href="/forgot-password">Reset password</a>
          </p>
          <label className="erax-field">
            <span>Cover image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void api.uploadCover(file).catch((caught: unknown) =>
                  setError(caught instanceof Error ? caught.message : 'Cover upload failed'),
                )
              }}
            />
          </label>
          <BlockList />
          <PreferenceForm />
        </>
      ) : null}
      <Button
        type="button"
        onClick={() => void api.logout().then(() => (window.location.href = '/'))}
      >
        Log out
      </Button>
    </section>
  )
}

function BlockList() {
  const [username, setUsername] = useState('')
  const [items, setItems] = useState<Array<{ username: string; displayName: string }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .blocks()
      .then((result) => setItems(result.items))
      .catch(() => undefined)
  }, [])

  return (
    <form
      className="erax-form"
      onSubmit={(event) => {
        event.preventDefault()
        void api
          .block(username, true)
          .then(() => api.blocks())
          .then((result) => {
            setItems(result.items)
            setUsername('')
          })
          .catch((caught: unknown) =>
            setError(caught instanceof ApiClientError ? caught.message : 'Block failed'),
          )
      }}
    >
      <h2>Blocked accounts</h2>
      {items.length === 0 ? <p className="erax-muted">You have not blocked anyone.</p> : null}
      {items.map((item) => (
        <p key={item.username}>
          @{item.username}{' '}
          <button
            type="button"
            onClick={() =>
              void api
                .block(item.username, false)
                .then(() => api.blocks())
                .then((result) => setItems(result.items))
            }
          >
            Unblock
          </button>
        </p>
      ))}
      <TextField label="Block a username" value={username} onChange={(event) => setUsername(event.target.value)} />
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit">Block</Button>
    </form>
  )
}

function PreferenceForm() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .preferences()
      .then(setPrefs)
      .catch(() => undefined)
  }, [])

  if (!prefs) return <p className="erax-muted">Loading notification preferences…</p>

  return (
    <form
      className="erax-form"
      onSubmit={(event) => {
        event.preventDefault()
        void api.updatePreferences(prefs).then(() => setSaved(true))
      }}
    >
      <h2>Notification preferences</h2>
      {Object.entries(prefs).map(([key, value]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })}
          />{' '}
          {key}
        </label>
      ))}
      <Button type="submit">Save preferences</Button>
      {saved ? <Note>Preferences saved.</Note> : null}
    </form>
  )
}
