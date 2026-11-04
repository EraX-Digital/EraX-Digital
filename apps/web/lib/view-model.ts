import type { PostCard } from '@erax/shared-types'

export function composerError(body: string, hasMedia: boolean, link: string): string | null {
  if (!body.trim() && !hasMedia && !link.trim()) return 'Add text, a link, or a file before publishing.'
  if (body.length > 2000) return 'Posts are limited to 2000 characters.'
  if (link.trim()) {
    try {
      const url = new URL(link.trim())
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Links must start with http or https.'
    } catch {
      return 'Links must start with http or https.'
    }
  }
  return null
}

export function emptyCopy(
  kind: 'following' | 'discover' | 'bookmarks' | 'profile' | 'community' | 'search' | 'media' | 'replies' | 'likes',
) {
  if (kind === 'following') {
    return {
      title: 'No posts from people you follow',
      body: 'Follow someone, or publish the first post on your account. Counts stay at zero until that happens.',
    }
  }
  if (kind === 'discover') {
    return {
      title: 'No public posts yet',
      body: 'Discover lists public posts in the order they were published. Nothing is marked trending.',
    }
  }
  if (kind === 'bookmarks') {
    return { title: 'No bookmarks', body: 'Posts you save will appear here.' }
  }
  if (kind === 'search') {
    return { title: 'No matches', body: 'Try a username, community name, hashtag, or words from a public post.' }
  }
  if (kind === 'community') {
    return { title: 'No community posts', body: 'Members have not published in this community.' }
  }
  if (kind === 'media') {
    return { title: 'No media posts', body: 'Posts with an image or video will appear here.' }
  }
  if (kind === 'replies') {
    return { title: 'No replies', body: 'Comments on visible posts will appear here.' }
  }
  if (kind === 'likes') {
    return { title: 'No likes', body: 'Posts you like stay on this tab. Other people cannot see this list.' }
  }
  return { title: 'No posts yet', body: 'This profile has no visible posts.' }
}

export function requiresSession(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/')
}

export function notificationLabel(type: string, name: string): string {
  const actor = name || 'Someone'
  if (type === 'follow') return `${actor} followed you.`
  if (type === 'like') return `${actor} liked your post or comment.`
  if (type === 'comment') return `${actor} commented on your post.`
  if (type === 'reply') return `${actor} replied to your comment.`
  if (type === 'repost') return `${actor} reposted your post.`
  if (type === 'message') return `${actor} sent you a message.`
  if (type === 'mention') return `${actor} mentioned you.`
  if (type === 'community_invite') return `${actor} invited you to a community.`
  if (type === 'community_join') return `${actor} joined your community.`
  return `${actor} sent a notification.`
}

export function postText(post: Pick<PostCard, 'body'>): string {
  return post.body
}

export function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
}
