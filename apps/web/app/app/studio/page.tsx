'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

type Studio = Awaited<ReturnType<typeof api.studio>>
type Discovery = Awaited<ReturnType<typeof api.discovery>>

const ranges = ['7d', '30d', '90d', 'all'] as const

export default function StudioPage() {
  const [range, setRange] = useState<(typeof ranges)[number]>('30d')
  const [studio, setStudio] = useState<Studio | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setStudio(null)
    api
      .studio(range)
      .then(setStudio)
      .catch((caught: unknown) => setError(caught instanceof ApiClientError ? caught.message : 'Studio could not be loaded'))
    api.discovery().then(setDiscovery).catch(() => setDiscovery(null))
  }, [range])

  async function saveDraft() {
    try {
      const saved = await api.saveDraft(draft)
      const published = await api.publishDraft(saved.id)
      setDraft('')
      setNotice(`Published ${published.id}`)
      setStudio(await api.studio(range))
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The draft was not published')
    }
  }

  return (
    <section className="erax-feed">
      <h1>Creator Studio</h1>
      <p className="erax-muted">Counts come from stored posts, reactions, and follows. Missing metrics stay unavailable.</p>
      <div className="erax-tabs" role="tablist">
        {ranges.map((value) => (
          <button
            key={value}
            type="button"
            className={range === value ? 'erax-tab erax-tab-active' : 'erax-tab'}
            onClick={() => setRange(value)}
          >
            {value === 'all' ? 'All time' : value}
          </button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="erax-note">{notice}</p> : null}
      {!studio ? <p className="erax-muted">Loading studio…</p> : null}
      {studio ? (
        <section className="erax-card">
          <p>{studio.followers.total} followers · {studio.followers.gainedInRange} new in this range</p>
          <p>{studio.posts} posts · {studio.likes} likes · {studio.replies} replies · {studio.reposts} reposts</p>
          <p className="erax-muted">Not measured: {studio.unavailable.join(', ')}.</p>
          {studio.topPosts.length === 0 ? <EmptyState title="No posts in this range" body="Publish a post to see it here." /> : null}
          <ul className="erax-list">
            {studio.topPosts.map((post) => (
              <li key={post.id}>
                <a href={`/app/posts/${post.id}`}>{post.body || 'Post'}</a>
                <span className="erax-muted"> · {post.likes} likes</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form
        className="erax-composer erax-form"
        onSubmit={(event) => {
          event.preventDefault()
          void saveDraft()
        }}
      >
        <h2>Draft, then publish</h2>
        <label className="erax-field">
          <span>Draft</span>
          <textarea value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <Button type="submit" disabled={draft.trim().length === 0}>
          Save and publish
        </Button>
      </form>
      {discovery ? (
        <section className="erax-card">
          <h2>Discovery</h2>
          <p className="erax-muted">{discovery.rule}</p>
          {discovery.topics.length === 0 ? <p className="erax-muted">No hashtags in the last 7 days.</p> : null}
          <ul className="erax-list">
            {discovery.topics.map((topic) => (
              <li key={topic.tag}>
                <a href={`/app/search?q=${encodeURIComponent('#' + topic.tag)}`}>#{topic.tag}</a>
                <span className="erax-muted"> · {topic.posts}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}
