export const SESSION_COOKIE = 'erax_session'
export const CSRF_COOKIE = 'erax_csrf'
export const CSRF_HEADER = 'x-erax-csrf'

export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'suspended'

export type PublicUser = {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  emailVerifiedAt: string | null
}

export type SocialLink = {
  label: string
  url: string
}

export type PublicProfile = {
  username: string
  displayName: string
  bio: string
  website: string | null
  avatarUrl: string | null
  coverUrl: string | null
  location: string | null
  socialLinks: SocialLink[]
  visibility: 'public' | 'private'
  creatorStatus: 'none' | 'creator'
  joinedAt: string
}

export type ProfileStats = {
  posts: number
  followers: number
  following: number
}

export type PublicProfileCard = PublicProfile & {
  stats: ProfileStats
  linkedWallets: Array<{ chainFamily: 'evm' | 'solana'; network: string; address: string }>
  viewer: { following: boolean; blocked: boolean; isSelf: boolean }
}

export type PostVisibility = 'public' | 'followers' | 'community'

export type PostAuthor = {
  username: string
  displayName: string
  avatarUrl: string | null
  creatorStatus: 'none' | 'creator'
}

export type PostMedia = {
  id: string
  url: string
  contentType: string
  kind: 'image' | 'video'
}

export type PostCard = {
  id: string
  body: string
  linkUrl: string | null
  visibility: PostVisibility
  createdAt: string
  editedAt: string | null
  author: PostAuthor
  community: { slug: string; name: string } | null
  media: PostMedia[]
  counts: { likes: number; comments: number; reposts: number; bookmarks: number }
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean }
}

export type CommentCard = {
  id: string
  body: string
  createdAt: string
  editedAt: string | null
  parentId: string | null
  author: PostAuthor
  likeCount: number
  viewerLiked: boolean
  replies: CommentCard[]
}

export type Page<T> = {
  items: T[]
  nextCursor: string | null
}

export type EmailDelivery =
  | {
      delivered: false
      transport: 'development-outbox'
      messageId: string
    }
  | {
      delivered: true
      transport: 'smtp'
      messageId: string
    }
  | {
      delivered: false
      transport: 'smtp'
      messageId: null
      reason: string
    }

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details: unknown
  }
}

export type WalletAuthStatus = {
  protocol: 'siwe' | 'siws'
  implemented: false
  missing: string[]
}
