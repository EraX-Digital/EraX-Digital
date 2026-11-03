import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PostCardView } from './post-card'
import { composerError, emptyCopy, notificationLabel, requiresSession } from '../lib/view-model'
import type { PostCard } from '@erax/shared-types'

const post: PostCard = {
  id: '11111111-1111-1111-1111-111111111111',
  body: '<script>alert(1)</script>',
  linkUrl: null,
  visibility: 'public',
  createdAt: '2026-11-03T00:00:00.000Z',
  editedAt: null,
  author: {
    username: 'ada',
    displayName: 'Ada',
    avatarUrl: null,
    creatorStatus: 'none',
  },
  community: null,
  media: [],
  counts: { likes: 0, comments: 0, reposts: 0, bookmarks: 0 },
  viewer: { liked: false, reposted: false, bookmarked: false },
}

describe('social screens', () => {
  it('renders post text without executing markup', () => {
    const html = renderToStaticMarkup(<PostCardView post={post} />)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('No posts from people you follow'.replace('No posts from people you follow', 'Ada'))
  })

  it('describes empty feeds and blocks unsigned composer submits', () => {
    expect(emptyCopy('discover').title).toBe('No public posts yet')
    expect(emptyCopy('following').body).toContain('zero')
    expect(composerError('   ', false, '')).toMatch(/Add text/)
    expect(composerError('Hello', false, 'notaurl')).toMatch(/http/)
    expect(composerError('Hello', false, '')).toBeNull()
    expect(requiresSession('/app/messages')).toBe(true)
    expect(requiresSession('/login')).toBe(false)
    expect(notificationLabel('follow', 'Grace')).toBe('Grace followed you.')
  })
})
