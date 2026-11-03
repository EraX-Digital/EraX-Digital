'use client'

import { ApiClientError } from '@erax/api-client'
import type { PostCard } from '@erax/shared-types'
import { Alert, Button, EmptyState, TextArea, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { composerError, emptyCopy } from '../lib/view-model'
import { PostCardView } from './post-card'

type Kind = 'following' | 'discover' | 'bookmarks' | 'profile' | 'community'

export function FeedScreen({
  kind,
  username,
  communityId,
  communitySlug,
}: {
  kind: Kind
  username?: string
  communityId?: string
  communitySlug?: string
}) {
  const [items, setItems] = useState<PostCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load() {
    const page =
      kind === 'following'
        ? await api.feed('following')
        : kind === 'discover'
          ? await api.feed('discover')
          : kind === 'bookmarks'
            ? await api.bookmarks()
            : kind === 'profile' && username
              ? await api.profilePosts(username)
              : kind === 'community' && communitySlug
                ? await api.communityPosts(communitySlug)
                : { items: [], nextCursor: null }
    setItems(page.items)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'The feed could not be loaded'),
    )
  }, [kind, username, communitySlug])

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const body = String(form.get('body') ?? '')
    const link = String(form.get('linkUrl') ?? '')
    const file = form.get('file')
    const hasMedia = file instanceof File && file.size > 0
    const problem = composerError(body, hasMedia, link)
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError(null)
    try {
      const mediaIds: string[] = []
      if (hasMedia && file instanceof File) {
        const uploaded = await api.uploadPostMedia(file)
        mediaIds.push(uploaded.id)
      }
      await api.createPost({
        body,
        linkUrl: link.trim() || null,
        visibility: (String(form.get('visibility') || 'public') as 'public' | 'followers' | 'community'),
        communityId,
        mediaIds,
      })
      formElement.reset()
      setNotice('Post published.')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'The post was not published')
    } finally {
      setPending(false)
    }
  }

  async function react(post: PostCard, action: 'like' | 'repost' | 'bookmark') {
    const active =
      action === 'like' ? !post.viewer.liked : action === 'repost' ? !post.viewer.reposted : !post.viewer.bookmarked
    try {
      const updated = await api.react(post.id, action, active)
      setItems((current) => current?.map((item) => (item.id === post.id ? updated : item)) ?? null)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'That action failed')
    }
  }

  const copy = emptyCopy(kind)

  return (
    <section className="erax-feed">
      {kind === 'following' || kind === 'community' ? (
        <form className="erax-card erax-form" onSubmit={(event) => void publish(event)}>
          <h2>{kind === 'community' ? 'Post to this community' : 'Create a post'}</h2>
          <TextArea label="Text" name="body" rows={4} maxLength={2000} />
          <TextField label="Link" name="linkUrl" placeholder="https://" />
          <label className="erax-field">
            <span>Image or MP4</span>
            <input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4" />
          </label>
          {kind === 'following' ? (
            <label className="erax-field">
              <span>Visibility</span>
              <select name="visibility" defaultValue="public">
                <option value="public">Public</option>
                <option value="followers">Followers</option>
              </select>
            </label>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          {notice ? <p className="erax-note">{notice}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Publishing…' : 'Publish'}
          </Button>
        </form>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : null}
      {items === null ? <p className="erax-muted">Loading posts…</p> : null}
      {items && items.length === 0 ? <EmptyState title={copy.title} body={copy.body} /> : null}
      {items?.map((post) => (
        <PostCardView
          key={post.id}
          post={post}
          onLike={() => void react(post, 'like')}
          onRepost={() => void react(post, 'repost')}
          onBookmark={() => void react(post, 'bookmark')}
        />
      ))}
    </section>
  )
}
