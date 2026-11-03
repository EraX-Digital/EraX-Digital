'use client'

import { ApiClientError } from '@erax/api-client'
import type { PostCard } from '@erax/shared-types'
import { Alert, Button, EmptyState, TextField } from '@erax/ui'
import { useState } from 'react'
import { PostCardView } from '../../../components/post-card'
import { api } from '../../../lib/api'
import { emptyCopy } from '../../../lib/view-model'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    users: Array<{ username: string; displayName: string }>
    posts: PostCard[]
    communities: Array<{ slug: string; name: string; memberCount: number }>
    hashtags: string[]
  } | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      setResult(await api.search(query))
    } catch (caught) {
      setResult(null)
      setError(caught instanceof ApiClientError ? caught.message : 'Search failed')
    }
  }

  const empty = emptyCopy('search')
  const nothing =
    result &&
    result.users.length + result.posts.length + result.communities.length + result.hashtags.length === 0

  return (
    <>
      <h1>Search</h1>
      <form className="erax-form" onSubmit={(event) => void onSubmit(event)}>
        <TextField label="People, posts, communities, or hashtags" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {nothing ? <EmptyState title={empty.title} body={empty.body} /> : null}
      {result?.users.map((user) => (
        <p key={user.username}>
          <a href={`/app/u/${user.username}`}>
            {user.displayName} @{user.username}
          </a>
        </p>
      ))}
      {result?.communities.map((community) => (
        <p key={community.slug}>
          <a href={`/app/communities/${community.slug}`}>
            {community.name}
          </a>{' '}
          <span className="erax-muted">{community.memberCount} members</span>
        </p>
      ))}
      {result?.hashtags.map((tag) => (
        <p key={tag}>#{tag}</p>
      ))}
      {result?.posts.map((post) => (
        <PostCardView key={post.id} post={post} />
      ))}
    </>
  )
}
