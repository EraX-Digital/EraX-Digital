import type { PostCard } from '@erax/shared-types'

export function PostCardView({
  post,
  onLike,
  onRepost,
  onBookmark,
}: {
  post: PostCard
  onLike?: () => void
  onRepost?: () => void
  onBookmark?: () => void
}) {
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
      {post.body ? <p className="erax-post-body">{post.body}</p> : null}
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
        {new Date(post.createdAt).toLocaleString()}
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
        <a href={`/p/${post.id}`}>Share link</a>
      </div>
    </article>
  )
}
