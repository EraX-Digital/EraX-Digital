import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type ApiErrorBody,
  type CommentCard,
  type EmailDelivery,
  type ActivityItem,
  type ChainStatus,
  type Page,
  type PostCard,
  type ProfileCommunityCard,
  type ProfileReply,
  type PublicProfile,
  type PublicProfileCard,
  type PublicUser,
} from '@erax/shared-types'
export { publicApiUrl } from './public-url'

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message)
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const row = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))
  return row ? decodeURIComponent(row.slice(name.length + 1)) : null
}

type RequestOptions = {
  method?: string
  body?: unknown
  form?: FormData
  csrf?: boolean
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers()
    if (options.body !== undefined) headers.set('content-type', 'application/json')
    if (options.csrf) {
      const token = readCookie(CSRF_COOKIE)
      if (token) headers.set(CSRF_HEADER, token)
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      credentials: 'include',
    })
    const text = await response.text()
    const data = text ? (JSON.parse(text) as T & ApiErrorBody) : null
    if (!response.ok) {
      const error = data && 'error' in data ? data.error : null
      throw new ApiClientError(
        response.status,
        error?.code ?? 'request_failed',
        error?.message ?? response.statusText,
        error?.details ?? null,
      )
    }
    return data as T
  }

  return {
    request,
    register(input: { email: string; password: string; username: string; displayName?: string }) {
      return request<{ user: PublicUser; emailDelivery: EmailDelivery }>('/api/v1/auth/register', {
        method: 'POST',
        body: input,
      })
    },
    verifyEmail(token: string) {
      return request<{ user: PublicUser }>('/api/v1/auth/verify-email', {
        method: 'POST',
        body: { token },
      })
    },
    login(email: string, password: string) {
      return request<{ user: PublicUser }>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      })
    },
    logout() {
      return request<{ loggedOut: boolean }>('/api/v1/auth/logout', { method: 'POST', csrf: true })
    },
    me() {
      return request<{ user: PublicUser; profile: PublicProfile }>('/api/v1/auth/me')
    },
    forgotPassword(email: string) {
      return request<{ message: string }>('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: { email },
      })
    },
    resetPassword(token: string, password: string) {
      return request<null>('/api/v1/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      })
    },
    updateProfile(input: {
      username?: string
      displayName?: string
      bio?: string
      website?: string | null
      location?: string | null
      visibility?: 'public' | 'private'
      creatorStatus?: 'none' | 'creator'
      socialLinks?: Array<{ label: string; url: string }>
    }) {
      return request<{ profile: PublicProfile }>('/api/v1/profile', {
        method: 'PATCH',
        body: input,
        csrf: true,
      })
    },
    uploadAvatar(file: File) {
      const form = new FormData()
      form.set('file', file)
      return request<{ avatarUrl: string }>('/api/v1/profile/avatar', {
        method: 'POST',
        form,
        csrf: true,
      })
    },
    outbox(email?: string) {
      const query = email ? `?email=${encodeURIComponent(email)}` : ''
      return request<{
        transport: 'development-outbox'
        delivered: false
        messages: Array<{ id: string; to: string; subject: string; text: string; purpose: string }>
      }>(`/api/v1/dev/outbox${query}`)
    },
    adminSummary() {
      return request<{ userCount: number; auditCount: number }>('/api/v1/admin/summary')
    },
    adminUsers() {
      return request<{
        users: Array<{
          id: string
          email: string
          role: 'user' | 'admin'
          status: 'active' | 'suspended'
          emailVerifiedAt: string | null
          createdAt: string
          username: string
          displayName: string
        }>
        nextCursor: string | null
      }>('/api/v1/admin/users')
    },
    setUserStatus(id: string, status: 'active' | 'suspended') {
      return request<{ user: PublicUser }>(`/api/v1/admin/users/${id}/status`, {
        method: 'POST',
        body: { status },
        csrf: true,
      })
    },
    auditLogs() {
      return request<{
        entries: Array<{
          id: string
          actorUserId: string | null
          action: string
          targetType: string | null
          targetId: string | null
          createdAt: string
        }>
        nextCursor: string | null
      }>('/api/v1/admin/audit-logs')
    },
    socialProfile(username: string) {
      return request<PublicProfileCard>(`/api/v1/profiles/${encodeURIComponent(username)}`)
    },
    feed(kind: 'following' | 'discover' | 'media', cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/feeds/${kind}${query}`)
    },
    profilePosts(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/profiles/${encodeURIComponent(username)}/posts${query}`)
    },
    profileReplies(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<ProfileReply>>(`/api/v1/profiles/${encodeURIComponent(username)}/replies${query}`)
    },
    profileMedia(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/profiles/${encodeURIComponent(username)}/media${query}`)
    },
    profileLikes(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/profiles/${encodeURIComponent(username)}/likes${query}`)
    },
    profileCommunities(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<ProfileCommunityCard>>(
        `/api/v1/profiles/${encodeURIComponent(username)}/communities${query}`,
      )
    },
    profileActivity(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<ActivityItem>>(`/api/v1/profiles/${encodeURIComponent(username)}/activity${query}`)
    },
    profileMutuals(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<{ username: string; displayName: string; avatarUrl: string | null }>>(
        `/api/v1/profiles/${encodeURIComponent(username)}/mutuals${query}`,
      )
    },
    followers(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<{ username: string; displayName: string; avatarUrl: string | null }>>(
        `/api/v1/profiles/${encodeURIComponent(username)}/followers${query}`,
      )
    },
    following(username: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<{ username: string; displayName: string; avatarUrl: string | null }>>(
        `/api/v1/profiles/${encodeURIComponent(username)}/following${query}`,
      )
    },
    chainStatus() {
      return request<ChainStatus>('/api/v1/socialfi/chain-status')
    },
    report(input: { targetType: 'post' | 'comment' | 'profile' | 'community'; targetId: string; reason: string }) {
      return request<{ reported: boolean }>('/api/v1/reports', { method: 'POST', body: input, csrf: true })
    },
    post(id: string) {
      return request<PostCard>(`/api/v1/posts/${id}`)
    },
    createPost(input: {
      body?: string
      linkUrl?: string | null
      visibility?: 'public' | 'followers' | 'community'
      communityId?: string | null
      mediaIds?: string[]
      quotePostId?: string | null
    }) {
      return request<PostCard>('/api/v1/posts', {
        method: 'POST',
        body: input,
        csrf: true,
      })
    },
    updatePost(id: string, input: { body?: string; linkUrl?: string | null }) {
      return request<PostCard>(`/api/v1/posts/${id}`, {
        method: 'PATCH',
        body: input,
        csrf: true,
      })
    },
    deletePost(id: string) {
      return request<null>(`/api/v1/posts/${id}`, { method: 'DELETE', csrf: true })
    },
    react(id: string, kind: 'like' | 'repost' | 'bookmark', active: boolean) {
      return request<PostCard>(`/api/v1/posts/${id}/${kind}`, {
        method: active ? 'POST' : 'DELETE',
        csrf: true,
      })
    },
    comments(id: string) {
      return request<Page<CommentCard>>(`/api/v1/posts/${id}/comments`)
    },
    comment(id: string, body: string, parentId?: string) {
      return request<CommentCard>(`/api/v1/posts/${id}/comments`, {
        method: 'POST',
        body: { body, parentId },
        csrf: true,
      })
    },
    bookmarks(cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/bookmarks${query}`)
    },
    follow(username: string, active: boolean) {
      return active
        ? request<{ following: boolean }>('/api/v1/follows', {
            method: 'POST',
            body: { username },
            csrf: true,
          })
        : request<{ following: boolean }>(`/api/v1/follows/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            csrf: true,
          })
    },
    block(username: string, active: boolean) {
      return active
        ? request<{ blocked: boolean }>('/api/v1/blocks', {
            method: 'POST',
            body: { username },
            csrf: true,
          })
        : request<{ blocked: boolean }>(`/api/v1/blocks/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            csrf: true,
          })
    },
    blocks() {
      return request<{ items: Array<{ username: string; displayName: string }> }>('/api/v1/blocks')
    },
    communities(q?: string) {
      const query = q ? `?q=${encodeURIComponent(q)}` : ''
      return request<{
        items: Array<{
          id: string
          name: string
          slug: string
          description: string
          visibility: 'public' | 'private'
          memberCount: number
          viewerRole: 'owner' | 'moderator' | 'member' | null
        }>
        nextCursor: string | null
      }>(`/api/v1/communities${query}`)
    },
    community(slug: string) {
      return request<{
        id: string
        name: string
        slug: string
        description: string
        rules: string
        visibility: 'public' | 'private'
        memberCount: number
        viewerRole: 'owner' | 'moderator' | 'member' | null
        avatarUrl: string | null
        coverUrl: string | null
        ownerUsername: string | null
      }>(`/api/v1/communities/${encodeURIComponent(slug)}`)
    },
    createCommunity(input: {
      name: string
      description?: string
      visibility?: 'public' | 'private'
    }) {
      return request<{ slug: string }>('/api/v1/communities', {
        method: 'POST',
        body: input,
        csrf: true,
      })
    },
    updateCommunity(
      slug: string,
      input: { name?: string; description?: string; rules?: string; visibility?: 'public' | 'private' },
    ) {
      return request(`/api/v1/communities/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: input,
        csrf: true,
      })
    },
    joinCommunity(slug: string) {
      return request(`/api/v1/communities/${encodeURIComponent(slug)}/join`, {
        method: 'POST',
        csrf: true,
      })
    },
    leaveCommunity(slug: string) {
      return request(`/api/v1/communities/${encodeURIComponent(slug)}/membership`, {
        method: 'DELETE',
        csrf: true,
      })
    },
    removeMember(slug: string, username: string) {
      return request<{ removed: boolean }>(
        `/api/v1/communities/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`,
        { method: 'DELETE', csrf: true },
      )
    },
    communityPosts(slug: string, cursor?: string) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      return request<Page<PostCard>>(`/api/v1/communities/${encodeURIComponent(slug)}/posts${query}`)
    },
    communityMembers(slug: string) {
      return request<{ items: Array<{ username: string; displayName: string; role: string }> }>(
        `/api/v1/communities/${encodeURIComponent(slug)}/members`,
      )
    },
    invite(slug: string, username: string) {
      return request(`/api/v1/communities/${encodeURIComponent(slug)}/invites`, {
        method: 'POST',
        body: { username },
        csrf: true,
      })
    },
    acceptInvite(id: string) {
      return request(`/api/v1/community-invites/${id}/accept`, { method: 'POST', csrf: true })
    },
    setRole(slug: string, username: string, role: 'moderator' | 'member') {
      return request(`/api/v1/communities/${encodeURIComponent(slug)}/roles`, {
        method: 'POST',
        body: { username, role },
        csrf: true,
      })
    },
    conversations() {
      return request<{
        items: Array<{
          id: string
          with: { username: string; displayName: string }
          lastMessage: { body: string; createdAt: string } | null
          unread: boolean
        }>
      }>('/api/v1/conversations')
    },
    openConversation(username: string) {
      return request<{ id: string }>('/api/v1/conversations', {
        method: 'POST',
        body: { username },
        csrf: true,
      })
    },
    messages(id: string) {
      return request<{
        items: Array<{
          id: string
          body: string
          createdAt: string
          mine: boolean
          sender: { username: string }
        }>
        nextCursor: string | null
      }>(`/api/v1/conversations/${id}/messages`)
    },
    sendMessage(id: string, body: string) {
      return request<{ id: string; body: string; createdAt: string }>(
        `/api/v1/conversations/${id}/messages`,
        { method: 'POST', body: { body }, csrf: true },
      )
    },
    markConversationRead(id: string) {
      return request(`/api/v1/conversations/${id}/read`, { method: 'POST', csrf: true })
    },
    notifications() {
      return request<{
        items: Array<{
          id: string
          type: string
          read: boolean
          createdAt: string
          targetType: string | null
          targetId: string | null
          actor: { username: string; displayName: string } | null
        }>
      }>('/api/v1/notifications')
    },
    notificationSummary() {
      return request<{ unread: number; unreadMessages: number; realtime: false }>(
        '/api/v1/notifications/summary',
      )
    },
    markNotification(id: string) {
      return request(`/api/v1/notifications/${id}/read`, { method: 'POST', csrf: true })
    },
    markAllNotifications() {
      return request('/api/v1/notifications/read-all', { method: 'POST', csrf: true })
    },
    preferences() {
      return request<Record<string, boolean>>('/api/v1/notification-preferences')
    },
    updatePreferences(input: Record<string, boolean>) {
      return request<Record<string, boolean>>('/api/v1/notification-preferences', {
        method: 'PATCH',
        body: input,
        csrf: true,
      })
    },
    search(q: string, type?: string) {
      const params = new URLSearchParams({ q })
      if (type) params.set('type', type)
      return request<{
        users: Array<{ username: string; displayName: string }>
        posts: PostCard[]
        communities: Array<{ slug: string; name: string; memberCount: number }>
        hashtags: string[]
      }>(`/api/v1/search?${params.toString()}`)
    },
    uploadPostMedia(file: File) {
      const form = new FormData()
      form.set('file', file)
      return request<{ id: string; url: string; kind: 'image' | 'video' }>('/api/v1/media', {
        method: 'POST',
        form,
        csrf: true,
      })
    },
    likeComment(id: string) {
      return request(`/api/v1/comments/${id}/like`, { method: 'POST', csrf: true })
    },
    uploadCover(file: File) {
      const form = new FormData()
      form.set('file', file)
      return request<{ coverUrl: string }>('/api/v1/profile/cover', {
        method: 'POST',
        form,
        csrf: true,
      })
    },
    walletNetworks() {
      return request<{
        networks: Array<{
          family: 'evm' | 'solana'
          caip2: string
          name: string
          chainId: number | null
          nativeSymbol: string
          nativeDecimals: number
          environment: 'mainnet' | 'testnet'
          rpcConfigured: boolean
        }>
      }>('/api/v1/wallet/networks')
    },
    walletAssets() {
      return request<{
        assets: Array<{
          network: string
          kind: string
          symbol: string
          name: string
          contractAddress: string
          decimals: number
          verified: boolean
        }>
        valuation: 'unavailable'
      }>('/api/v1/wallet/assets')
    },
    walletChallenge(
      protocol: 'siwe' | 'siws',
      body: { address: string; network: string; purpose: 'sign-in' | 'link' },
    ) {
      return request<{ message: string; nonce: string; expiresAt: string }>(
        `/api/v1/auth/${protocol}/challenge`,
        { method: 'POST', body, csrf: body.purpose === 'link' },
      )
    },
    walletVerify(protocol: 'siwe' | 'siws', body: { message: string; signature: string }) {
      return request<{ user: PublicUser | null; walletId: string; linked: boolean }>(
        `/api/v1/auth/${protocol}/verify`,
        { method: 'POST', body, csrf: true },
      )
    },
    wallets() {
      return request<{
        wallets: Array<{
          id: string
          family: 'evm' | 'solana'
          network: string
          networkName: string
          address: string
          preferred: boolean
          connected: boolean
          verifiedAt: string | null
          explorerUrl: string | null
        }>
      }>('/api/v1/wallets')
    },
    walletBalances(id: string) {
      return request<{
        balances: Array<{
          symbol: string | null
          name: string | null
          assetAddress: string
          amountBaseUnits: string
          amount: string | null
          decimals: number | null
          verified: boolean
        }>
        valuation: 'unavailable'
      }>(`/api/v1/wallets/${id}/balances`)
    },
    disconnectWallet(id: string) {
      return request(`/api/v1/wallets/${id}`, { method: 'DELETE', csrf: true })
    },
    preferWallet(id: string) {
      return request(`/api/v1/wallets/${id}/preferred`, { method: 'POST', csrf: true })
    },
    previewTransfer(body: { walletId: string; recipient: string; assetAddress: string; amount: string }) {
      return request<{
        network: string
        sender: string
        recipient: string
        asset: { symbol: string; name: string; assetAddress: string; decimals: number; verified: boolean }
        amount: string
        amountBaseUnits: string
        fee: string | null
        feeBaseUnits: string | null
        feeStatus: 'estimated' | 'not_configured'
        warnings: string[]
        transaction: {
          chainId?: number
          to?: string
          value?: string
          data?: `0x${string}`
          instructions?: Array<{
            programId: string
            keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>
            dataBase64: string
          }>
        }
      }>('/api/v1/wallets/transfers/preview', { method: 'POST', body, csrf: true })
    },
    recordTransaction(body: {
      walletId: string
      recipient: string
      assetAddress: string
      assetSymbol: string
      amountBaseUnits: string
      hash: string
      feeBaseUnits?: string
    }) {
      return request<{ transaction: { id: string; status: string }; confirmed: boolean }>(
        '/api/v1/wallets/transactions',
        { method: 'POST', body, csrf: true },
      )
    },
    walletTransactions(cursor?: string) {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      return request<{
        transactions: Array<{
          id: string
          network: string
          hash: string
          sender: string
          recipient: string
          assetSymbol: string
          amountBaseUnits: string
          feeBaseUnits: string | null
          status: string
          source: 'erax' | 'chain'
          createdAt: string
          explorerUrl: string | null
        }>
        nextCursor: string | null
        coverage: string
      }>(`/api/v1/wallets/transactions?${params.toString()}`)
    },
    refreshTransaction(id: string) {
      return request<{ transaction: { id: string; status: string }; confirmation: string }>(
        `/api/v1/wallets/transactions/${id}/refresh`,
        { method: 'POST', csrf: true },
      )
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
