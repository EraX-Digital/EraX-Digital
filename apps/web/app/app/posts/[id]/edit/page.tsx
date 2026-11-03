'use client'

import { ApiClientError } from '@erax/api-client'
import type { PostCard } from '@erax/shared-types'
import { Alert, Button, TextArea, TextField } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../../../../../lib/api'

export default function EditPostPage() {
  const params = useParams<{ id: string }>()
  const [post, setPost] = useState<PostCard | null>(null)
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .post(params.id)
      .then((loaded) => {
        setPost(loaded)
        setBody(loaded.body)
        setLinkUrl(loaded.linkUrl ?? '')
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Post could not be loaded'))
  }, [params.id])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      const updated = await api.updatePost(params.id, { body, linkUrl: linkUrl || null })
      setPost(updated)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Post was not updated')
    }
  }

  async function remove() {
    try {
      await api.deletePost(params.id)
      window.location.href = '/app'
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Post was not deleted')
    }
  }

  if (!post && !error) return <p className="erax-muted">Loading post…</p>

  return (
    <>
      <h1>Edit post</h1>
      {error ? <Alert>{error}</Alert> : null}
      <form className="erax-form" onSubmit={(event) => void save(event)}>
        <TextArea label="Text" value={body} onChange={(event) => setBody(event.target.value)} />
        <TextField label="Link" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
        <Button type="submit">Save</Button>
      </form>
      <Button type="button" onClick={() => void remove()}>
        Delete post
      </Button>
    </>
  )
}
