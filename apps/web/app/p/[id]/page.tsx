import type { PostCard } from '@erax/shared-types'

export default async function PublicPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000'
  const response = await fetch(`${base}/api/v1/posts/${id}`, { cache: 'no-store' })
  if (!response.ok) {
    return (
      <main className="erax-shell">
        <h1>Post unavailable</h1>
        <p className="erax-muted">This post is private, removed, or the address is wrong.</p>
        <a href="/login">Sign in</a>
      </main>
    )
  }
  const post = (await response.json()) as PostCard
  return (
    <main className="erax-shell">
      <p className="erax-kicker">EraX Social</p>
      <h1>{post.author.displayName}</h1>
      <p>@{post.author.username}</p>
      <p>{post.body}</p>
      {post.linkUrl ? <p><a href={post.linkUrl}>{post.linkUrl}</a></p> : null}
      <p>
        <a href="/login">Sign in to reply</a>
      </p>
    </main>
  )
}
