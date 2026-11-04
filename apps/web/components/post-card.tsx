'use client'

import type { PostCard } from '@erax/shared-types'
import { useState } from 'react'
import { formatTimestamp } from '../lib/view-model'
import { PostText } from './post-text'

export function PostCardView({
  post,
  onLike,
  onRepost,
  onBookmark,
  onReport,
}: {
  post: PostCard
  onLike?: () => void
  onRepost?: () => void
  onBookmark?: () => void
  onReport?: (reason: string) => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [reportNote, setReportNote] = useState<string | null>(null)

  async function copyLink() {
    const url = `${window.location.origin}/p/${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setManualUrl(null)
    } catch {
      setCopied(false)
      setManualUrl(url)
    }
  }

  return (
    <article className="erax-post erax-card">
      <header className="erax-post-head">
        <a href={`/app/u/${post.author.username}`}>
          <strong>{post.author.displayName}</strong>
          <span className="erax-muted"> @{post.author.username}</span>
        </a>
        {post.author.creatorStatus === 'creator' ? (
          <span className="erax-pill">Self-declared creator</span>
        ) : null}
      </header>
      {post.community ? (
        <p className="erax-muted">
          In <a href={`/app/communities/${post.community.slug}`}>{post.community.name}</a>
        </p>
      ) : null}
      {post.body ? (
        <p className="erax-post-body">
          <PostText text={post.body} />
        </p>
      ) : null}
      {post.quote ? (
        <blockquote className="erax-quote">
          <a href={`/app/posts/${post.quote.id}`}>
            @{post.quote.author.username}
          </a>
          <p className="erax-post-body">
            <PostText text={post.quote.body} />
          </p>
        </blockquote>
      ) : null}
      {post.linkUrl ? (
        <p>
          <a href={post.linkUrl}>{post.linkUrl}</a>
        </p>
      ) : null}
      {post.media.length > 0 ? (
        <div className="erax-media-grid">
          {post.media.map((file) =>
            file.kind === 'video' ? (
              <video key={file.id} controls src={file.url} />
            ) : (
              <img key={file.id} alt="" src={file.url} />
            ),
          )}
        </div>
      ) : null}
      <p className="erax-muted">
        <a href={`/app/posts/${post.id}`}>{formatTimestamp(post.createdAt)}</a>
        {post.editedAt ? ' · edited' : ''} · {post.visibility}
      </p>
      <div className="erax-actions">
        <button type="button" onClick={onLike}>
          {post.viewer.liked ? 'Liked' : 'Like'} {post.counts.likes}
        </button>
        <button type="button" onClick={onRepost}>
          {post.viewer.reposted ? 'Reposted' : 'Repost'} {post.counts.reposts}
        </button>
        <button type="button" onClick={onBookmark}>
          {post.viewer.bookmarked ? 'Saved' : 'Bookmark'} {post.counts.bookmarks}
        </button>
        <a href={`/app/posts/${post.id}`}>Comments {post.counts.comments}</a>
        <a href={`/app/posts/${post.id}?quote=1`}>Quote</a>
        <button type="button" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {onReport ? (
          <button type="button" onClick={() => setReporting((value) => !value)}>
            Report
          </button>
        ) : null}
      </div>
      {reporting && onReport ? (
        <form
          className="erax-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onReport(reason)
              .then(() => {
                setReportNote('Report saved. This version does not hide the post automatically.')
                setReason('')
                setReporting(false)
              })
              .catch(() => setReportNote('The report was not saved.'))
          }}
        >
          <label className="erax-field">
            <span>Why are you reporting this post?</span>
            <textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="erax-button-secondary" type="submit">
            Submit report
          </button>
        </form>
      ) : null}
      {manualUrl ? <p className="erax-muted">Copy this link: {manualUrl}</p> : null}
      {reportNote ? <p className="erax-note">{reportNote}</p> : null}
    </article>
  )
}
