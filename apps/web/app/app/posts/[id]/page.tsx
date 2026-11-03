'use client'

import { ApiClientError } from '@erax/api-client'
import type { CommentCard, PostCard } from '@erax/shared-types'
import { Alert, Button, TextArea } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PostCardView } from '../../../../components/post-card'
import { api } from '../../../../lib/api'

export default function PostPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [post, setPost] = useState<PostCard | null>(null)
  const [comments, setComments] = useState<CommentCard[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)

  async function load() {
    const [nextPost, nextComments, session] = await Promise.all([api.post(id), api.comments(id), api.me()])
    setPost(nextPost)
    setComments(nextComments.items)
    setMe(session.profile.username)
  }

  useEffect(() => {
    load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Post could not be loaded'))
  }, [id])

  async function comment(event: React.FormEvent, parentId?: string) {
    event.preventDefault()
    try {
      await api.comment(id, body, parentId)
      setBody('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Comment was not published')
    }
  }

  if (!post && !error) return <p className="erax-muted">Loading post…</p>
  if (!post) return <Alert>{error}</Alert>

  return (
    <>
      <PostCardView
        post={post}
        onLike={() => void api.react(post.id, 'like', !post.viewer.liked).then(setPost)}
        onRepost={() => void api.react(post.id, 'repost', !post.viewer.reposted).then(setPost)}
        onBookmark={() => void api.react(post.id, 'bookmark', !post.viewer.bookmarked).then(setPost)}
      />
      {me === post.author.username ? (
        <p>
          <a href={`/app/posts/${post.id}/edit`}>Edit post</a>
        </p>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      <form className="erax-form" onSubmit={(event) => void comment(event)}>
        <TextArea label="Comment" value={body} onChange={(event) => setBody(event.target.value)} />
        <Button type="submit">Comment</Button>
      </form>
      <ul className="erax-list">
        {comments.map((item) => (
          <li key={item.id}>
            <Comment item={item} onReply={(parentId, text) => api.comment(id, text, parentId).then(load)} />
          </li>
        ))}
      </ul>
    </>
  )
}

function Comment({
  item,
  onReply,
}: {
  item: CommentCard
  onReply: (parentId: string, body: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  return (
    <article>
      <p>
        <a href={`/app/u/${item.author.username}`}>@{item.author.username}</a> {item.body}
      </p>
      <p className="erax-muted">{item.likeCount} likes</p>
      <button type="button" onClick={() => void api.likeComment(item.id)}>
        Like
      </button>
      {item.parentId ? null : (
        <button type="button" onClick={() => setOpen((value) => !value)}>
          Reply
        </button>
      )}
      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onReply(item.id, text).then(() => setText(''))
          }}
        >
          <TextArea label="Reply" value={text} onChange={(event) => setText(event.target.value)} />
          <Button type="submit">Reply</Button>
        </form>
      ) : null}
      {item.replies.map((reply) => (
        <p key={reply.id}>
          <a href={`/app/u/${reply.author.username}`}>@{reply.author.username}</a> {reply.body}
        </p>
      ))}
    </article>
  )
}
