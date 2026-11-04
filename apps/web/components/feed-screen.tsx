'use client'

import { ApiClientError } from '@erax/api-client'
import type { PostCard } from '@erax/shared-types'
import { Alert, Button, EmptyState, TextArea, TextField } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { composerError, emptyCopy } from '../lib/view-model'
import { PostCardView } from './post-card'

type Kind = 'following' | 'discover' | 'media' | 'bookmarks' | 'profile' | 'community'

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
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  async function load(cursor?: string) {
    const page =
      kind === 'following' || kind === 'discover' || kind === 'media'
        ? await api.feed(kind, cursor)
        : kind === 'bookmarks'
          ? await api.bookmarks(cursor)
          : kind === 'profile' && username
            ? await api.profilePosts(username, cursor)
            : kind === 'community' && communitySlug
              ? await api.communityPosts(communitySlug, cursor)
              : { items: [], nextCursor: null }
    setNextCursor(page.nextCursor)
    setItems((current) => (cursor ? [...(current ?? []), ...page.items] : page.items))
  }

  useEffect(() => {
    setItems(null)
    setNextCursor(null)
    setError(null)
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
    const files = form
      .getAll('file')
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, 4)
    const problem = composerError(body, files.length > 0, link)
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError(null)
    try {
      const mediaIds: string[] = []
      for (const file of files) {
        const uploaded = await api.uploadPostMedia(file)
        mediaIds.push(uploaded.id)
      }
      const created = await api.createPost({
        body,
        linkUrl: link.trim() || null,
        visibility: String(form.get('visibility') || 'public') as 'public' | 'followers' | 'community',
        communityId,
        mediaIds,
      })
      const pollOptions = [String(form.get('pollA') ?? ''), String(form.get('pollB') ?? '')]
        .map((option) => option.trim())
        .filter(Boolean)
      if (pollOptions.length === 1) throw new ApiClientError(400, 'invalid_poll', 'Add a second poll option, or leave both blank')
      if (pollOptions.length === 2) await api.attachPoll(created.id, pollOptions)
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
      setError(null)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'That action failed')
    }
  }

  async function report(postId: string, reason: string) {
    await api.report({ targetType: 'post', targetId: postId, reason })
  }

  const copy = emptyCopy(kind === 'media' ? 'media' : kind)

  return (
    <section className="erax-feed">
      {kind === 'following' || kind === 'community' ? (
        <form className="erax-composer erax-form" onSubmit={(event) => void publish(event)}>
          <h2>{kind === 'community' ? 'Post to this community' : 'Create a post'}</h2>
          <TextArea label="Text" name="body" rows={4} maxLength={2000} />
          <TextField label="Link" name="linkUrl" placeholder="https://" />
          <TextField label="Poll option 1" name="pollA" maxLength={80} />
          <TextField label="Poll option 2" name="pollB" maxLength={80} />
          <label className="erax-field">
            <span>Up to 4 images, or one MP4</span>
            <input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4" multiple />
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
      <div className="erax-actions">
        <button
          className="erax-button-secondary"
          type="button"
          onClick={() => {
            setError(null)
            load().catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : 'The feed could not be refreshed'),
            )
          }}
        >
          Refresh
        </button>
      </div>
      {items === null && !error ? (
        <div className="erax-card" aria-hidden="true">
          <div className="erax-skeleton" />
          <div className="erax-skeleton" />
          <div className="erax-skeleton erax-skeleton-short" />
        </div>
      ) : null}
      {items && items.length === 0 ? <EmptyState title={copy.title} body={copy.body} /> : null}
      {items?.map((post) => (
        <PostCardView
          key={post.id}
          post={post}
          onLike={() => void react(post, 'like')}
          onRepost={() => void react(post, 'repost')}
          onBookmark={() => void react(post, 'bookmark')}
          onReport={(reason) => report(post.id, reason)}
        />
      ))}
      {nextCursor ? (
        <Button
          type="button"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true)
            load(nextCursor)
              .catch((caught: unknown) =>
                setError(caught instanceof Error ? caught.message : 'More posts could not be loaded'),
              )
              .finally(() => setLoadingMore(false))
          }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </section>
  )
}
