import { randomUUID } from 'node:crypto'
import {
  auditLogs,
  chainProgramEvents,
  comments,
  contentReports,
  commentLikes,
  communities,
  communityInvites,
  communityMembers,
  conversationParticipants,
  conversations,
  follows,
  hashtags,
  mediaAssets,
  messages,
  notificationPreferences,
  notifications,
  postBookmarks,
  postHashtags,
  postLikes,
  postMedia,
  postReposts,
  posts,
  profiles,
  userBlocks,
  userMentions,
  users,
  wallets,
  type Database,
} from '@erax/database'
import type {
  ActivityItem,
  ChainStatus,
  CommentCard,
  Page,
  PostCard,
  PostMedia,
  ProfileCommunityCard,
  ProfileReply,
  PublicProfileCard,
  QuotePreview,
  SocialLink,
} from '@erax/shared-types'
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { ApiError } from './errors'
import { sniffMedia } from './media-bytes'
import { storageUnavailable, type MediaStorage } from './media'
import { cleanText, escapeLike, extractHashtags, extractMentions, httpUrl } from './text'

type Cursor = { createdAt: string; id: string }
type PrefKey = 'follows' | 'likes' | 'comments' | 'replies' | 'reposts' | 'messages' | 'communities'

const IMAGE_LIMIT = 5_000_000
const VIDEO_LIMIT = 20_000_000

export type SocialServiceOptions = {
  db: Database
  media: MediaStorage
  apiOrigin: string
  now(): Date
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor
    if (!parsed.createdAt || !parsed.id) throw new Error('missing')
    return parsed
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'Cursor is invalid')
  }
}

function limited(value: string | undefined, fallback = 20): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), 50)
}

function mediaUrl(apiOrigin: string, key: string | null): string | null {
  if (!key) return null
  return `${apiOrigin}/api/v1/media/${key}`
}

function authorOf(profile: typeof profiles.$inferSelect, apiOrigin: string) {
  return {
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: mediaUrl(apiOrigin, profile.avatarStorageKey),
    creatorStatus: profile.creatorStatus,
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    throw new ApiError(400, 'invalid_slug', 'Use a name that produces a 3-40 character slug')
  }
  return slug
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

export function createSocialService(options: SocialServiceOptions) {
  const { db, media, apiOrigin } = options

  async function writeAudit(
    tx: Pick<Database, 'insert'>,
    entry: { actorUserId: string; action: string; targetType: string; targetId: string },
  ) {
    await tx.insert(auditLogs).values({
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: {},
    })
  }

  async function profileByUsername(username: string) {
    const rows = await db
      .select({ profile: profiles, user: users })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(sql`lower(${profiles.username}) = ${username.toLowerCase()}`)
      .limit(1)
    return rows[0] ?? null
  }

  async function isBlocked(a: string, b: string): Promise<boolean> {
    const rows = await db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
          and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
        ),
      )
      .limit(1)
    return Boolean(rows[0])
  }

  async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const rows = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
      .limit(1)
    return Boolean(rows[0])
  }

  async function membership(communityId: string, userId: string | null) {
    if (!userId) return null
    const rows = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
      .limit(1)
    return rows[0] ?? null
  }

  async function canViewProfile(
    viewerId: string | null,
    profile: typeof profiles.$inferSelect,
  ): Promise<boolean> {
    if (viewerId && viewerId !== profile.userId) {
      const rows = await db
        .select({ blockerId: userBlocks.blockerId })
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, profile.userId)),
            and(eq(userBlocks.blockerId, profile.userId), eq(userBlocks.blockedId, viewerId)),
          ),
        )
        .limit(1)
      if (rows[0]?.blockerId === profile.userId) return false
      if (rows[0]?.blockerId === viewerId) return true
    }
    if (profile.visibility === 'public') return true
    if (!viewerId) return false
    if (viewerId === profile.userId) return true
    return isFollowing(viewerId, profile.userId)
  }

  async function canViewPost(
    viewerId: string | null,
    post: typeof posts.$inferSelect,
    profile: typeof profiles.$inferSelect,
    community: typeof communities.$inferSelect | null,
  ): Promise<boolean> {
    if (post.deletedAt) return false
    if (viewerId && (await isBlocked(viewerId, post.authorId))) return false
    if (viewerId === post.authorId) return true
    if (!(await canViewProfile(viewerId, profile))) return false
    if (post.visibility === 'followers') {
      if (!viewerId) return false
      if (!(await isFollowing(viewerId, post.authorId))) return false
    }
    if (community) {
      const member = await membership(community.id, viewerId)
      if (community.visibility === 'private' && !member) return false
      if (post.visibility === 'community' && !member) return false
    }
    return true
  }

  async function preferenceAllows(userId: string, key: PrefKey): Promise<boolean> {
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1)
    if (!rows[0]) return true
    return rows[0][key]
  }

  async function notify(input: {
    userId: string
    actorUserId: string
    type: string
    preference: PrefKey
    targetType?: string
    targetId?: string
    dedupeKey: string
  }) {
    if (input.userId === input.actorUserId) return
    if (!(await preferenceAllows(input.userId, input.preference))) return
    try {
      await db.insert(notifications).values({
        userId: input.userId,
        actorUserId: input.actorUserId,
        type: input.type,
        targetType: input.targetType,
        targetId: input.targetId,
        dedupeKey: input.dedupeKey,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('notifications_dedupe_idx') && !message.includes('23505')) throw error
    }
  }

  async function presentPosts(
    rows: Array<{
      post: typeof posts.$inferSelect
      profile: typeof profiles.$inferSelect
      community: typeof communities.$inferSelect | null
    }>,
    viewerId: string | null,
  ): Promise<PostCard[]> {
    const visible = []
    for (const row of rows) {
      if (await canViewPost(viewerId, row.post, row.profile, row.community)) visible.push(row)
    }
    if (visible.length === 0) return []
    const ids = visible.map((row) => row.post.id)
    const [likeRows, commentRows, repostRows, bookmarkRows, mediaRows, mineLikes, mineReposts, mineBookmarks] =
      await Promise.all([
        db
          .select({ id: postLikes.postId, value: sql<number>`count(*)::int` })
          .from(postLikes)
          .where(inArray(postLikes.postId, ids))
          .groupBy(postLikes.postId),
        db
          .select({ id: comments.postId, value: sql<number>`count(*)::int` })
          .from(comments)
          .where(and(inArray(comments.postId, ids), isNull(comments.deletedAt)))
          .groupBy(comments.postId),
        db
          .select({ id: postReposts.postId, value: sql<number>`count(*)::int` })
          .from(postReposts)
          .where(inArray(postReposts.postId, ids))
          .groupBy(postReposts.postId),
        db
          .select({ id: postBookmarks.postId, value: sql<number>`count(*)::int` })
          .from(postBookmarks)
          .where(inArray(postBookmarks.postId, ids))
          .groupBy(postBookmarks.postId),
        db
          .select({ link: postMedia, asset: mediaAssets })
          .from(postMedia)
          .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
          .where(inArray(postMedia.postId, ids))
          .orderBy(asc(postMedia.position)),
        viewerId
          ? db
              .select({ id: postLikes.postId })
              .from(postLikes)
              .where(and(inArray(postLikes.postId, ids), eq(postLikes.userId, viewerId)))
          : Promise.resolve([]),
        viewerId
          ? db
              .select({ id: postReposts.postId })
              .from(postReposts)
              .where(and(inArray(postReposts.postId, ids), eq(postReposts.userId, viewerId)))
          : Promise.resolve([]),
        viewerId
          ? db
              .select({ id: postBookmarks.postId })
              .from(postBookmarks)
              .where(and(inArray(postBookmarks.postId, ids), eq(postBookmarks.userId, viewerId)))
          : Promise.resolve([]),
      ])
    const count = (rows: Array<{ id: string; value: number }>, id: string) =>
      Number(rows.find((row) => row.id === id)?.value ?? 0)
    const mediaByPost = new Map<string, PostMedia[]>()
    for (const row of mediaRows) {
      const list = mediaByPost.get(row.link.postId) ?? []
      list.push({
        id: row.asset.id,
        url: mediaUrl(apiOrigin, row.asset.storageKey) ?? '',
        contentType: row.asset.contentType,
        kind: row.asset.kind,
      })
      mediaByPost.set(row.link.postId, list)
    }
    const liked = new Set(mineLikes.map((row) => row.id))
    const reposted = new Set(mineReposts.map((row) => row.id))
    const bookmarked = new Set(mineBookmarks.map((row) => row.id))
    const quoteIds = [
      ...new Set(visible.map((row) => row.post.quotePostId).filter((id): id is string => Boolean(id))),
    ]
    const quoteRows = quoteIds.length
      ? await db
          .select({ post: posts, profile: profiles, community: communities })
          .from(posts)
          .innerJoin(profiles, eq(profiles.userId, posts.authorId))
          .leftJoin(communities, eq(communities.id, posts.communityId))
          .where(inArray(posts.id, quoteIds))
      : []
    const quoteById = new Map<string, QuotePreview>()
    for (const row of quoteRows) {
      if (!(await canViewPost(viewerId, row.post, row.profile, row.community))) continue
      quoteById.set(row.post.id, {
        id: row.post.id,
        body: row.post.body,
        author: authorOf(row.profile, apiOrigin),
      })
    }
    return visible.map((row) => ({
      id: row.post.id,
      body: row.post.body,
      linkUrl: row.post.linkUrl,
      visibility: row.post.visibility,
      createdAt: row.post.createdAt.toISOString(),
      editedAt: row.post.editedAt ? row.post.editedAt.toISOString() : null,
      author: authorOf(row.profile, apiOrigin),
      community: row.community ? { slug: row.community.slug, name: row.community.name } : null,
      media: mediaByPost.get(row.post.id) ?? [],
      counts: {
        likes: count(likeRows, row.post.id),
        comments: count(commentRows, row.post.id),
        reposts: count(repostRows, row.post.id),
        bookmarks: count(bookmarkRows, row.post.id),
      },
      viewer: {
        liked: liked.has(row.post.id),
        reposted: reposted.has(row.post.id),
        bookmarked: bookmarked.has(row.post.id),
      },
      quote: row.post.quotePostId ? (quoteById.get(row.post.quotePostId) ?? null) : null,
    }))
  }

  async function loadPost(id: string) {
    const rows = await db
      .select({ post: posts, profile: profiles, community: communities })
      .from(posts)
      .innerJoin(profiles, eq(profiles.userId, posts.authorId))
      .leftJoin(communities, eq(communities.id, posts.communityId))
      .where(eq(posts.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async function requireVisiblePost(id: string, viewerId: string | null) {
    const row = await loadPost(id)
    if (!row || !(await canViewPost(viewerId, row.post, row.profile, row.community))) {
      throw new ApiError(404, 'post_not_found', 'Post was not found')
    }
    return row
  }

  async function syncTags(tx: Pick<Database, 'insert' | 'delete' | 'select'>, postId: string, body: string, actorId: string) {
    await tx.delete(postHashtags).where(eq(postHashtags.postId, postId))
    await tx.delete(userMentions).where(eq(userMentions.postId, postId))
    for (const tag of extractHashtags(body)) {
      const existing = await tx.select().from(hashtags).where(eq(hashtags.tag, tag)).limit(1)
      const hashtag = existing[0] ?? (await tx.insert(hashtags).values({ tag }).returning())[0]
      if (!hashtag) continue
      await tx.insert(postHashtags).values({ postId, hashtagId: hashtag.id })
    }
    for (const username of extractMentions(body)) {
      const mentioned = await profileByUsername(username)
      if (!mentioned || mentioned.user.id === actorId) continue
      await tx.insert(userMentions).values({ postId, mentionedUserId: mentioned.user.id })
      await notify({
        userId: mentioned.user.id,
        actorUserId: actorId,
        type: 'mention',
        preference: 'comments',
        targetType: 'post',
        targetId: postId,
        dedupeKey: `mention:post:${postId}:${mentioned.user.id}`,
      })
    }
  }

  async function pageFrom<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): Promise<Page<T>> {
    const items = rows.slice(0, limit)
    const next = rows[limit]
    return {
      items,
      nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id }) : null,
    }
  }

  return {
    async uploadMedia(userId: string, bytes: Buffer) {
      const sniffed = sniffMedia(bytes)
      if (!sniffed) throw new ApiError(400, 'invalid_media', 'Upload a PNG, JPEG, WebP, GIF, or MP4 file')
      const limit = sniffed.kind === 'video' ? VIDEO_LIMIT : IMAGE_LIMIT
      if (bytes.length > limit) {
        throw new ApiError(400, 'invalid_media', `File is larger than ${Math.floor(limit / 1_000_000)} MB`)
      }
      const key = `posts/${userId}/${randomUUID()}${sniffed.extension}`
      try {
        await media.put(key, bytes)
      } catch (error) {
        if (storageUnavailable(error)) {
          throw new ApiError(
            503,
            'media_unavailable',
            'Image and video upload is not available because media storage is not configured.',
          )
        }
        throw error
      }
      const inserted = await db
        .insert(mediaAssets)
        .values({
          ownerUserId: userId,
          storageKey: key,
          contentType: sniffed.contentType,
          byteSize: bytes.length,
          kind: sniffed.kind,
        })
        .returning()
      const asset = inserted[0]
      if (!asset) throw new ApiError(500, 'internal_error', 'Media could not be stored')
      return {
        id: asset.id,
        url: mediaUrl(apiOrigin, key),
        contentType: asset.contentType,
        kind: asset.kind,
      }
    },

    async getProfile(viewerId: string | null, username: string): Promise<PublicProfileCard> {
      const found = await profileByUsername(username)
      if (!found || found.user.status !== 'active') {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      if (!(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      const userId = found.user.id
      const [postCount, followerCount, followingCount, walletRows, mutualCount] = await Promise.all([
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(posts)
          .where(and(eq(posts.authorId, userId), isNull(posts.deletedAt))),
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(follows)
          .where(eq(follows.followeeId, userId)),
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(follows)
          .where(eq(follows.followerId, userId)),
        db
          .select()
          .from(wallets)
          .where(
            and(
              eq(wallets.userId, userId),
              sql`${wallets.verifiedAt} is not null`,
              isNull(wallets.disconnectedAt),
            ),
          ),
        viewerId && viewerId !== userId
          ? db
              .select({ value: sql<number>`count(*)::int` })
              .from(follows)
              .where(
                and(
                  eq(follows.followeeId, userId),
                  sql`${follows.followerId} in (select followee_id from follows where follower_id = ${viewerId})`,
                ),
              )
          : Promise.resolve([{ value: 0 }]),
      ])
      const links = Array.isArray(found.profile.socialLinks)
        ? (found.profile.socialLinks as SocialLink[])
        : []
      return {
        username: found.profile.username,
        displayName: found.profile.displayName,
        bio: found.profile.bio,
        website: found.profile.website,
        avatarUrl: mediaUrl(apiOrigin, found.profile.avatarStorageKey),
        coverUrl: mediaUrl(apiOrigin, found.profile.coverStorageKey),
        location: found.profile.location,
        socialLinks: links,
        visibility: found.profile.visibility,
        creatorStatus: found.profile.creatorStatus,
        joinedAt: found.user.createdAt.toISOString(),
        stats: {
          posts: Number(postCount[0]?.value ?? 0),
          followers: Number(followerCount[0]?.value ?? 0),
          following: Number(followingCount[0]?.value ?? 0),
        },
        linkedWallets: walletRows.map((row) => ({
          chainFamily: row.chainFamily,
          network: row.network,
          address: row.address,
        })),
        viewer: {
          following: viewerId ? await isFollowing(viewerId, userId) : false,
          blocked: viewerId ? await isBlocked(viewerId, userId) : false,
          isSelf: viewerId === userId,
          mutualCount: Number(mutualCount[0]?.value ?? 0),
        },
      }
    },

    async follow(viewerId: string, username: string) {
      const found = await profileByUsername(username)
      if (!found) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      if (found.user.id === viewerId) throw new ApiError(400, 'cannot_follow_self', 'You cannot follow yourself')
      if (await isBlocked(viewerId, found.user.id)) {
        throw new ApiError(403, 'blocked', 'This profile is not available')
      }
      try {
        await db.insert(follows).values({ followerId: viewerId, followeeId: found.user.id })
      } catch (error) {
        const message = `${error instanceof Error ? error.message : ''} ${JSON.stringify(error)}`
        if (message.includes('23505') || message.includes('follows')) {
          return { following: true }
        }
        throw error
      }
      await notify({
        userId: found.user.id,
        actorUserId: viewerId,
        type: 'follow',
        preference: 'follows',
        targetType: 'user',
        targetId: viewerId,
        dedupeKey: `follow:${viewerId}`,
      })
      return { following: true }
    },

    async unfollow(viewerId: string, username: string) {
      const found = await profileByUsername(username)
      if (!found) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      await db
        .delete(follows)
        .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, found.user.id)))
      return { following: false }
    },

    async listFollows(viewerId: string | null, username: string, direction: 'followers' | 'following', cursorValue: string | undefined, limitValue: string | undefined) {
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const column = direction === 'followers' ? follows.followerId : follows.followeeId
      const other = direction === 'followers' ? follows.followerId : follows.followeeId
      const match = direction === 'followers' ? follows.followeeId : follows.followerId
      const rows = await db
        .select({ profile: profiles, createdAt: follows.createdAt, id: other })
        .from(follows)
        .innerJoin(profiles, eq(profiles.userId, column))
        .where(
          and(
            eq(match, found.user.id),
            cursor ? or(lt(follows.createdAt, new Date(cursor.createdAt)), and(eq(follows.createdAt, new Date(cursor.createdAt)), lt(other, cursor.id))) : undefined,
          ),
        )
        .orderBy(desc(follows.createdAt), desc(other))
        .limit(limit + 1)
      const page = await pageFrom(
        rows.map((row) => ({ ...authorOf(row.profile, apiOrigin), createdAt: row.createdAt, id: row.id })),
        limit,
      )
      return { items: page.items.map(({ createdAt: _created, id: _id, ...person }) => person), nextCursor: page.nextCursor }
    },

    async block(viewerId: string, username: string) {
      const found = await profileByUsername(username)
      if (!found) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      if (found.user.id === viewerId) throw new ApiError(400, 'cannot_block_self', 'You cannot block yourself')
      await db.transaction(async (tx) => {
        await tx
          .insert(userBlocks)
          .values({ blockerId: viewerId, blockedId: found.user.id })
          .onConflictDoNothing()
        await tx
          .delete(follows)
          .where(
            or(
              and(eq(follows.followerId, viewerId), eq(follows.followeeId, found.user.id)),
              and(eq(follows.followerId, found.user.id), eq(follows.followeeId, viewerId)),
            ),
          )
        await writeAudit(tx, {
          actorUserId: viewerId,
          action: 'user.blocked',
          targetType: 'user',
          targetId: found.user.id,
        })
      })
      return { blocked: true }
    },

    async unblock(viewerId: string, username: string) {
      const found = await profileByUsername(username)
      if (!found) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      await db
        .delete(userBlocks)
        .where(and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, found.user.id)))
      return { blocked: false }
    },

    async listBlocks(viewerId: string) {
      const rows = await db
        .select({ profile: profiles })
        .from(userBlocks)
        .innerJoin(profiles, eq(profiles.userId, userBlocks.blockedId))
        .where(eq(userBlocks.blockerId, viewerId))
        .orderBy(desc(userBlocks.createdAt))
      return { items: rows.map((row) => authorOf(row.profile, apiOrigin)) }
    },

    async createPost(
      userId: string,
      input: {
        body?: string
        linkUrl?: string | null
        visibility?: 'public' | 'followers' | 'community'
        communityId?: string | null
        mediaIds?: string[]
        quotePostId?: string | null
      },
    ) {
      let body = ''
      try {
        body = cleanText(input.body ?? '', 2000)
      } catch {
        throw new ApiError(400, 'invalid_post', 'Post text must be 2000 characters or fewer')
      }
      const link = input.linkUrl ? safeUrl(input.linkUrl) : null
      const mediaIds = [...new Set(input.mediaIds ?? [])]
      let quotePostId: string | null = null
      if (input.quotePostId) {
        const quoted = await requireVisiblePost(input.quotePostId, userId)
        if (quoted.post.id === input.quotePostId) quotePostId = quoted.post.id
      }
      if (!body && !link && mediaIds.length === 0 && !quotePostId) {
        throw new ApiError(400, 'invalid_post', 'Add text, a link, or media')
      }
      if (mediaIds.length > 4) throw new ApiError(400, 'invalid_post', 'A post can include up to 4 files')
      let community: typeof communities.$inferSelect | null = null
      let visibility = input.visibility ?? 'public'
      if (input.communityId) {
        const rows = await db.select().from(communities).where(eq(communities.id, input.communityId)).limit(1)
        community = rows[0] ?? null
        if (!community) throw new ApiError(404, 'community_not_found', 'Community was not found')
        const member = await membership(community.id, userId)
        if (!member) throw new ApiError(403, 'forbidden', 'Join this community before posting')
        if (community.visibility === 'private') visibility = 'community'
      }
      if (visibility === 'community' && !community) {
        throw new ApiError(400, 'invalid_post', 'Community visibility requires a community')
      }
      const assets = mediaIds.length
        ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds))
        : []
      if (assets.length !== mediaIds.length || assets.some((asset) => asset.ownerUserId !== userId)) {
        throw new ApiError(400, 'invalid_media', 'Media does not belong to this account')
      }
      const videos = assets.filter((asset) => asset.kind === 'video')
      if (videos.length > 1 || (videos.length === 1 && assets.length > 1)) {
        throw new ApiError(400, 'invalid_media', 'A video post can contain one video and no other files')
      }
      const attached = mediaIds.length
        ? await db.select().from(postMedia).where(inArray(postMedia.assetId, mediaIds))
        : []
      if (attached.length > 0) throw new ApiError(400, 'invalid_media', 'That file is already attached to a post')
      const created = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(posts)
          .values({
            authorId: userId,
            communityId: community?.id,
            body,
            linkUrl: link,
            quotePostId,
            visibility,
          })
          .returning()
        const post = inserted[0]
        if (!post) throw new ApiError(500, 'internal_error', 'Post could not be created')
        for (const [position, assetId] of mediaIds.entries()) {
          await tx.insert(postMedia).values({ postId: post.id, assetId, position })
        }
        return post
      })
      await syncTags(db, created.id, body, userId)
      const loaded = await loadPost(created.id)
      if (!loaded) throw new ApiError(500, 'internal_error', 'Post could not be loaded')
      const cards = await presentPosts([loaded], userId)
      const card = cards[0]
      if (!card) throw new ApiError(500, 'internal_error', 'Post could not be loaded')
      return card
    },

    async updatePost(userId: string, postId: string, input: { body?: string; linkUrl?: string | null }) {
      const row = await requireVisiblePost(postId, userId)
      if (row.post.authorId !== userId) throw new ApiError(403, 'forbidden', 'You can edit only your own posts')
      let body = row.post.body
      if (input.body !== undefined) {
        try {
          body = cleanText(input.body, 2000)
        } catch {
          throw new ApiError(400, 'invalid_post', 'Post text must be 2000 characters or fewer')
        }
      }
      const link = input.linkUrl === undefined ? row.post.linkUrl : input.linkUrl ? safeUrl(input.linkUrl) : null
      if (!body && !link) {
        const mediaCount = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(postMedia)
          .where(eq(postMedia.postId, postId))
        if (Number(mediaCount[0]?.value ?? 0) === 0) {
          throw new ApiError(400, 'invalid_post', 'Add text, a link, or media')
        }
      }
      await db
        .update(posts)
        .set({ body, linkUrl: link, editedAt: options.now(), updatedAt: options.now() })
        .where(eq(posts.id, postId))
      await syncTags(db, postId, body, userId)
      const loaded = await loadPost(postId)
      if (!loaded) throw new ApiError(404, 'post_not_found', 'Post was not found')
      const cards = await presentPosts([loaded], userId)
      return cards[0]
    },

    async deletePost(userId: string, postId: string) {
      const row = await loadPost(postId)
      if (!row || row.post.deletedAt) throw new ApiError(404, 'post_not_found', 'Post was not found')
      if (row.post.authorId !== userId) throw new ApiError(403, 'forbidden', 'You can delete only your own posts')
      await db.update(posts).set({ deletedAt: options.now() }).where(eq(posts.id, postId))
      return { deleted: true }
    },

    async getPost(viewerId: string | null, postId: string) {
      const row = await requireVisiblePost(postId, viewerId)
      const cards = await presentPosts([row], viewerId)
      const card = cards[0]
      if (!card) throw new ApiError(404, 'post_not_found', 'Post was not found')
      return card
    },

    async setReaction(
      userId: string,
      postId: string,
      kind: 'like' | 'repost' | 'bookmark',
      active: boolean,
    ) {
      const row = await requireVisiblePost(postId, userId)
      const table = kind === 'like' ? postLikes : kind === 'repost' ? postReposts : postBookmarks
      if (active) {
        const inserted = await db
          .insert(table)
          .values({ postId, userId })
          .onConflictDoNothing()
          .returning()
        if (inserted[0] && kind !== 'bookmark' && row.post.authorId !== userId) {
          await notify({
            userId: row.post.authorId,
            actorUserId: userId,
            type: kind === 'like' ? 'like' : 'repost',
            preference: kind === 'like' ? 'likes' : 'reposts',
            targetType: 'post',
            targetId: postId,
            dedupeKey: `${kind}:${postId}:${userId}`,
          })
        }
      } else {
        await db.delete(table).where(and(eq(table.postId, postId), eq(table.userId, userId)))
      }
      return this.getPost(userId, postId)
    },

    async listBookmarks(userId: string, cursorValue?: string, limitValue?: string) {
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const rows = await db
        .select({ post: posts, profile: profiles, community: communities, createdAt: postBookmarks.createdAt })
        .from(postBookmarks)
        .innerJoin(posts, eq(posts.id, postBookmarks.postId))
        .innerJoin(profiles, eq(profiles.userId, posts.authorId))
        .leftJoin(communities, eq(communities.id, posts.communityId))
        .where(
          and(
            eq(postBookmarks.userId, userId),
            isNull(posts.deletedAt),
            cursor
              ? or(
                  lt(postBookmarks.createdAt, new Date(cursor.createdAt)),
                  and(eq(postBookmarks.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(postBookmarks.createdAt), desc(posts.id))
        .limit(limit + 1)
      const cards = await presentPosts(rows.slice(0, limit), userId)
      const next = rows[limit]
      return {
        items: cards,
        nextCursor: next
          ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.post.id })
          : null,
      }
    },

    async feed(
      viewerId: string | null,
      kind: 'following' | 'discover' | 'profile' | 'community' | 'media' | 'profile-media',
      target: string | undefined,
      cursorValue: string | undefined,
      limitValue: string | undefined,
    ): Promise<Page<PostCard>> {
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      if (kind === 'following') {
        if (!viewerId) throw new ApiError(401, 'unauthenticated', 'Sign in required')
        return followingFeed(db, viewerId, cursor, limit, presentPosts)
      }
      const filters = [
        isNull(posts.deletedAt),
        eq(posts.visibility, 'public'),
        eq(profiles.visibility, 'public'),
        or(isNull(posts.communityId), eq(communities.visibility, 'public')),
      ]
      if (kind === 'profile' || kind === 'profile-media') {
        const found = await profileByUsername(target ?? '')
        if (!found || !(await canViewProfile(viewerId, found.profile))) {
          throw new ApiError(404, 'profile_not_found', 'Profile was not found')
        }
        filters.splice(0, filters.length, isNull(posts.deletedAt), eq(posts.authorId, found.user.id))
        if (viewerId !== found.user.id) {
          const following = viewerId ? await isFollowing(viewerId, found.user.id) : false
          filters.push(following ? sql`${posts.visibility} in ('public', 'followers')` : eq(posts.visibility, 'public'))
        }
      }
      if (kind === 'community') {
        const communityRows = await db
          .select()
          .from(communities)
          .where(sql`lower(${communities.slug}) = ${(target ?? '').toLowerCase()}`)
          .limit(1)
        const community = communityRows[0]
        if (!community) throw new ApiError(404, 'community_not_found', 'Community was not found')
        const member = await membership(community.id, viewerId)
        if (community.visibility === 'private' && !member) {
          throw new ApiError(404, 'community_not_found', 'Community was not found')
        }
        filters.splice(0, filters.length, isNull(posts.deletedAt), eq(posts.communityId, community.id))
      }
      if (kind === 'media' || kind === 'profile-media') {
        filters.push(sql`exists (select 1 from post_media where post_id = ${posts.id})`)
      }
      if (cursor) {
        filters.push(
          or(
            lt(posts.createdAt, new Date(cursor.createdAt)),
            and(eq(posts.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
          )!,
        )
      }
      if (viewerId) {
        filters.push(sql`not exists (
          select 1 from user_blocks b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${posts.authorId})
             or (b.blocked_id = ${viewerId} and b.blocker_id = ${posts.authorId})
        )`)
      }
      const rows = await db
        .select({ post: posts, profile: profiles, community: communities })
        .from(posts)
        .innerJoin(profiles, eq(profiles.userId, posts.authorId))
        .leftJoin(communities, eq(communities.id, posts.communityId))
        .where(and(...filters))
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(limit + 1)
      const cards = await presentPosts(rows.slice(0, limit), viewerId)
      const next = rows[limit]
      return {
        items: cards,
        nextCursor: next ? encodeCursor({ createdAt: next.post.createdAt.toISOString(), id: next.post.id }) : null,
      }
    },

    async createComment(userId: string, postId: string, input: { body: string; parentId?: string | null }) {
      const row = await requireVisiblePost(postId, userId)
      let body = ''
      try {
        body = cleanText(input.body, 1000)
      } catch {
        throw new ApiError(400, 'invalid_comment', 'Comment must be 1-1000 characters')
      }
      if (!body) throw new ApiError(400, 'invalid_comment', 'Comment must be 1-1000 characters')
      let parent: typeof comments.$inferSelect | null = null
      if (input.parentId) {
        const parents = await db.select().from(comments).where(eq(comments.id, input.parentId)).limit(1)
        parent = parents[0] ?? null
        if (!parent || parent.postId !== postId || parent.deletedAt || parent.parentId) {
          throw new ApiError(400, 'invalid_comment', 'Reply to a top-level comment on this post')
        }
      }
      const inserted = await db
        .insert(comments)
        .values({ postId, authorId: userId, parentId: parent?.id, body })
        .returning()
      const comment = inserted[0]
      if (!comment) throw new ApiError(500, 'internal_error', 'Comment could not be created')
      for (const username of extractMentions(body)) {
        const mentioned = await profileByUsername(username)
        if (!mentioned || mentioned.user.id === userId) continue
        await db.insert(userMentions).values({ commentId: comment.id, mentionedUserId: mentioned.user.id })
        await notify({
          userId: mentioned.user.id,
          actorUserId: userId,
          type: 'mention',
          preference: 'comments',
          targetType: 'comment',
          targetId: comment.id,
          dedupeKey: `mention:comment:${comment.id}:${mentioned.user.id}`,
        })
      }
      if (parent && parent.authorId !== userId) {
        await notify({
          userId: parent.authorId,
          actorUserId: userId,
          type: 'reply',
          preference: 'replies',
          targetType: 'comment',
          targetId: comment.id,
          dedupeKey: `reply:${comment.id}`,
        })
      } else if (row.post.authorId !== userId) {
        await notify({
          userId: row.post.authorId,
          actorUserId: userId,
          type: 'comment',
          preference: 'comments',
          targetType: 'post',
          targetId: postId,
          dedupeKey: `comment:${comment.id}`,
        })
      }
      return commentCard(db, comment.id, userId, apiOrigin)
    },

    async updateComment(userId: string, commentId: string, bodyInput: string) {
      const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1)
      const comment = rows[0]
      if (!comment || comment.deletedAt) throw new ApiError(404, 'comment_not_found', 'Comment was not found')
      await requireVisiblePost(comment.postId, userId)
      if (comment.authorId !== userId) throw new ApiError(403, 'forbidden', 'You can edit only your own comments')
      let body = ''
      try {
        body = cleanText(bodyInput, 1000)
      } catch {
        throw new ApiError(400, 'invalid_comment', 'Comment must be 1-1000 characters')
      }
      if (!body) throw new ApiError(400, 'invalid_comment', 'Comment must be 1-1000 characters')
      await db.update(comments).set({ body, editedAt: options.now() }).where(eq(comments.id, commentId))
      return commentCard(db, commentId, userId, apiOrigin)
    },

    async deleteComment(userId: string, commentId: string) {
      const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1)
      const comment = rows[0]
      if (!comment || comment.deletedAt) throw new ApiError(404, 'comment_not_found', 'Comment was not found')
      if (comment.authorId !== userId) throw new ApiError(403, 'forbidden', 'You can delete only your own comments')
      await db.update(comments).set({ deletedAt: options.now() }).where(eq(comments.id, commentId))
      return { deleted: true }
    },

    async setCommentLike(userId: string, commentId: string, active: boolean) {
      const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1)
      const comment = rows[0]
      if (!comment || comment.deletedAt) throw new ApiError(404, 'comment_not_found', 'Comment was not found')
      await requireVisiblePost(comment.postId, userId)
      if (active) {
        const inserted = await db
          .insert(commentLikes)
          .values({ commentId, userId })
          .onConflictDoNothing()
          .returning()
        if (inserted[0]) {
          await notify({
            userId: comment.authorId,
            actorUserId: userId,
            type: 'like',
            preference: 'likes',
            targetType: 'comment',
            targetId: commentId,
            dedupeKey: `like:comment:${commentId}:${userId}`,
          })
        }
      } else {
        await db
          .delete(commentLikes)
          .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)))
      }
      return commentCard(db, commentId, userId, apiOrigin)
    },

    async listComments(viewerId: string | null, postId: string, cursorValue?: string, limitValue?: string) {
      await requireVisiblePost(postId, viewerId)
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const rows = await db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.postId, postId),
            isNull(comments.parentId),
            isNull(comments.deletedAt),
            cursor
              ? or(
                  lt(comments.createdAt, new Date(cursor.createdAt)),
                  and(eq(comments.createdAt, new Date(cursor.createdAt)), lt(comments.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(comments.createdAt), asc(comments.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const cards = []
      for (const row of page) {
        const card = await commentCard(db, row.id, viewerId, apiOrigin)
        if (card) cards.push(card)
      }
      const next = rows[limit]
      return {
        items: cards,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id }) : null,
      }
    },

    async createCommunity(
      userId: string,
      input: {
        name: string
        description?: string
        rules?: string
        visibility?: 'public' | 'private'
        slug?: string
      },
    ) {
      const name = input.name.trim()
      if (name.length < 3 || name.length > 60) {
        throw new ApiError(400, 'invalid_community', 'Community name must be 3-60 characters')
      }
      const description = (input.description ?? '').trim()
      const rules = (input.rules ?? '').trim()
      if (description.length > 500) {
        throw new ApiError(400, 'invalid_community', 'Description must be 500 characters or fewer')
      }
      if (rules.length > 2000) {
        throw new ApiError(400, 'invalid_community', 'Rules must be 2000 characters or fewer')
      }
      const slug = input.slug ? input.slug.toLowerCase() : slugify(name)
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
        throw new ApiError(400, 'invalid_slug', 'Slug must be 3-40 lowercase letters, numbers, or hyphens')
      }
      try {
        const created = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(communities)
            .values({
              ownerId: userId,
              name,
              slug,
              description,
              rules,
              visibility: input.visibility ?? 'public',
            })
            .returning()
          const community = inserted[0]
          if (!community) throw new ApiError(500, 'internal_error', 'Community could not be created')
          await tx.insert(communityMembers).values({ communityId: community.id, userId, role: 'owner' })
          await writeAudit(tx, {
            actorUserId: userId,
            action: 'community.created',
            targetType: 'community',
            targetId: community.id,
          })
          return community
        })
        return communityCard(db, created, userId, apiOrigin)
      } catch (error) {
        if (error instanceof ApiError) throw error
        const message = error instanceof Error ? error.message : ''
        if (message.includes('communities_slug_unique') || message.includes('23505')) {
          throw new ApiError(409, 'slug_taken', 'That community slug is already used')
        }
        throw error
      }
    },

    async updateCommunity(
      userId: string,
      slug: string,
      input: { name?: string; description?: string; rules?: string; visibility?: 'public' | 'private' },
    ) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, userId)
      if (!member || (member.role !== 'owner' && member.role !== 'moderator')) {
        throw new ApiError(403, 'forbidden', 'You cannot edit this community')
      }
      if (member.role !== 'owner' && (input.name !== undefined || input.visibility !== undefined)) {
        throw new ApiError(403, 'forbidden', 'Only the owner can change the name or visibility')
      }
      const name = input.name === undefined ? community.name : input.name.trim()
      const description = input.description === undefined ? community.description : input.description.trim()
      const rules = input.rules === undefined ? community.rules : input.rules.trim()
      if (name.length < 3 || name.length > 60 || description.length > 500 || rules.length > 2000) {
        throw new ApiError(400, 'invalid_community', 'Check the community name, description, and rules lengths')
      }
      const updated = await db
        .update(communities)
        .set({
          name,
          description,
          rules,
          visibility: member.role === 'owner' ? (input.visibility ?? community.visibility) : community.visibility,
          updatedAt: options.now(),
        })
        .where(eq(communities.id, community.id))
        .returning()
      return communityCard(db, updated[0] ?? community, userId, apiOrigin)
    },

    async communityImage(userId: string, slug: string, kind: 'avatar' | 'cover', bytes: Buffer) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, userId)
      if (!member || (member.role !== 'owner' && member.role !== 'moderator')) {
        throw new ApiError(403, 'forbidden', 'You cannot edit this community')
      }
      const sniffed = sniffMedia(bytes)
      if (!sniffed || sniffed.kind !== 'image') {
        throw new ApiError(400, 'invalid_media', 'Community images must be PNG, JPEG, WebP, or GIF')
      }
      if (bytes.length > IMAGE_LIMIT) throw new ApiError(400, 'invalid_media', 'Image is larger than 5 MB')
      const key = `communities/${community.id}/${kind}-${randomUUID()}${sniffed.extension}`
      try {
        await media.put(key, bytes)
      } catch (error) {
        if (storageUnavailable(error)) {
          throw new ApiError(
            503,
            'media_unavailable',
            'Image and video upload is not available because media storage is not configured.',
          )
        }
        throw error
      }
      const previous = kind === 'avatar' ? community.avatarStorageKey : community.coverStorageKey
      await db
        .update(communities)
        .set(kind === 'avatar' ? { avatarStorageKey: key } : { coverStorageKey: key })
        .where(eq(communities.id, community.id))
      if (previous) await media.remove(previous)
      return { url: mediaUrl(apiOrigin, key) }
    },

    async getCommunity(viewerId: string | null, slug: string) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, viewerId)
      if (community.visibility === 'private' && !member) {
        throw new ApiError(404, 'community_not_found', 'Community was not found')
      }
      return communityCard(db, community, viewerId, apiOrigin)
    },

    async listCommunities(viewerId: string | null, cursorValue?: string, query?: string) {
      const cursor = decodeCursor(cursorValue)
      const limit = 20
      const term = query?.trim()
      const rows = await db
        .select()
        .from(communities)
        .where(
          and(
            viewerId
              ? sql`(
                  ${communities.visibility} = 'public'
                  or exists (
                    select 1 from community_members m
                    where m.community_id = ${communities.id} and m.user_id = ${viewerId}
                  )
                )`
              : eq(communities.visibility, 'public'),
            term
              ? sql`(
                  lower(${communities.name}) like ${'%' + escapeLike(term.toLowerCase()) + '%'} escape '\\'
                  or lower(${communities.slug}) like ${'%' + escapeLike(term.toLowerCase()) + '%'} escape '\\'
                )`
              : undefined,
            cursor
              ? or(
                  lt(communities.createdAt, new Date(cursor.createdAt)),
                  and(eq(communities.createdAt, new Date(cursor.createdAt)), lt(communities.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(communities.createdAt), desc(communities.id))
        .limit(limit + 1)
      const cards = []
      for (const row of rows.slice(0, limit)) cards.push(await communityCard(db, row, viewerId, apiOrigin))
      const next = rows[limit]
      return {
        items: cards,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id }) : null,
      }
    },

    async joinCommunity(userId: string, slug: string) {
      const community = await communityBySlug(db, slug)
      if (community.visibility === 'private') {
        throw new ApiError(403, 'invite_required', 'This community requires an invitation')
      }
      await db
        .insert(communityMembers)
        .values({ communityId: community.id, userId, role: 'member' })
        .onConflictDoNothing()
      await notify({
        userId: community.ownerId,
        actorUserId: userId,
        type: 'community_join',
        preference: 'communities',
        targetType: 'community',
        targetId: community.id,
        dedupeKey: `community.join:${community.id}:${userId}`,
      })
      return communityCard(db, community, userId, apiOrigin)
    },

    async leaveCommunity(userId: string, slug: string) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, userId)
      if (!member) return { left: true }
      if (member.role === 'owner') {
        throw new ApiError(400, 'owner_cannot_leave', 'Transfer ownership before leaving')
      }
      await db
        .delete(communityMembers)
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, userId)))
      return { left: true }
    },

    async invite(userId: string, slug: string, username: string) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, userId)
      if (!member || (member.role !== 'owner' && member.role !== 'moderator')) {
        throw new ApiError(403, 'forbidden', 'You cannot invite members')
      }
      const person = await profileByUsername(username)
      if (!person) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      if (await membership(community.id, person.user.id)) return { invited: false, alreadyMember: true }
      const inserted = await db
        .insert(communityInvites)
        .values({ communityId: community.id, inviterId: userId, inviteeId: person.user.id })
        .onConflictDoNothing()
        .returning()
      if (inserted[0]) {
        await notify({
          userId: person.user.id,
          actorUserId: userId,
          type: 'community_invite',
          preference: 'communities',
          targetType: 'community_invite',
          targetId: inserted[0].id,
          dedupeKey: `community.invite:${community.id}:${person.user.id}`,
        })
      }
      return { invited: Boolean(inserted[0]), alreadyMember: false, id: inserted[0]?.id ?? null }
    },

    async acceptInvite(userId: string, inviteId: string) {
      const rows = await db.select().from(communityInvites).where(eq(communityInvites.id, inviteId)).limit(1)
      const invite = rows[0]
      if (!invite || invite.inviteeId !== userId) throw new ApiError(404, 'invite_not_found', 'Invitation was not found')
      await db.transaction(async (tx) => {
        await tx
          .update(communityInvites)
          .set({ acceptedAt: options.now() })
          .where(eq(communityInvites.id, invite.id))
        await tx
          .insert(communityMembers)
          .values({ communityId: invite.communityId, userId, role: 'member' })
          .onConflictDoNothing()
      })
      const communityRows = await db.select().from(communities).where(eq(communities.id, invite.communityId)).limit(1)
      const community = communityRows[0]
      if (!community) throw new ApiError(404, 'community_not_found', 'Community was not found')
      return communityCard(db, community, userId, apiOrigin)
    },

    async setMemberRole(actorId: string, slug: string, username: string, role: 'moderator' | 'member') {
      const community = await communityBySlug(db, slug)
      const actor = await membership(community.id, actorId)
      if (!actor || actor.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the owner can change roles')
      const person = await profileByUsername(username)
      if (!person) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      if (person.user.id === community.ownerId) {
        throw new ApiError(400, 'cannot_change_owner', 'The owner role stays with the creator')
      }
      const updated = await db
        .update(communityMembers)
        .set({ role })
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, person.user.id)))
        .returning()
      if (!updated[0]) throw new ApiError(404, 'member_not_found', 'That person is not a member')
      await db.insert(auditLogs).values({
        actorUserId: actorId,
        action: 'community.role_changed',
        targetType: 'community_member',
        targetId: person.user.id,
        metadata: { communityId: community.id, role },
      })
      return { role }
    },

    async listMembers(viewerId: string | null, slug: string) {
      const community = await communityBySlug(db, slug)
      const member = await membership(community.id, viewerId)
      if (community.visibility === 'private' && !member) {
        throw new ApiError(404, 'community_not_found', 'Community was not found')
      }
      const rows = await db
        .select({ profile: profiles, role: communityMembers.role })
        .from(communityMembers)
        .innerJoin(profiles, eq(profiles.userId, communityMembers.userId))
        .where(eq(communityMembers.communityId, community.id))
        .orderBy(asc(communityMembers.createdAt))
        .limit(100)
      return { items: rows.map((row) => ({ ...authorOf(row.profile, apiOrigin), role: row.role })) }
    },

    async removeMember(actorId: string, slug: string, username: string) {
      const community = await communityBySlug(db, slug)
      const actor = await membership(community.id, actorId)
      if (!actor || (actor.role !== 'owner' && actor.role !== 'moderator')) {
        throw new ApiError(403, 'forbidden', 'You cannot remove members')
      }
      const person = await profileByUsername(username)
      if (!person) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      const target = await membership(community.id, person.user.id)
      if (!target) throw new ApiError(404, 'member_not_found', 'That person is not a member')
      if (target.role === 'owner') throw new ApiError(403, 'forbidden', 'The owner cannot be removed')
      if (actor.role === 'moderator' && target.role !== 'member') {
        throw new ApiError(403, 'forbidden', 'Moderators can remove members only')
      }
      await db
        .delete(communityMembers)
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, person.user.id)))
      return { removed: true }
    },

    async openConversation(userId: string, username: string) {
      const person = await profileByUsername(username)
      if (!person) throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      if (person.user.id === userId) throw new ApiError(400, 'cannot_message_self', 'Choose another person')
      if (await isBlocked(userId, person.user.id)) throw new ApiError(403, 'blocked', 'This conversation is not available')
      const key = pairKey(userId, person.user.id)
      const existing = await db.select().from(conversations).where(eq(conversations.pairKey, key)).limit(1)
      const conversation =
        existing[0] ??
        (
          await db.insert(conversations).values({ pairKey: key }).onConflictDoNothing().returning()
        )[0] ??
        (await db.select().from(conversations).where(eq(conversations.pairKey, key)).limit(1))[0]
      if (!conversation) throw new ApiError(500, 'internal_error', 'Conversation could not be opened')
      await db
        .insert(conversationParticipants)
        .values([
          { conversationId: conversation.id, userId },
          { conversationId: conversation.id, userId: person.user.id },
        ])
        .onConflictDoNothing()
      return { id: conversation.id }
    },

    async listConversations(userId: string) {
      const rows = await db
        .select({ conversation: conversations, participant: conversationParticipants })
        .from(conversationParticipants)
        .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
        .where(eq(conversationParticipants.userId, userId))
        .orderBy(desc(conversations.updatedAt))
      const items = []
      for (const row of rows) {
        const others = await db
          .select({ profile: profiles })
          .from(conversationParticipants)
          .innerJoin(profiles, eq(profiles.userId, conversationParticipants.userId))
          .where(
            and(
              eq(conversationParticipants.conversationId, row.conversation.id),
              sql`${conversationParticipants.userId} <> ${userId}`,
            ),
          )
          .limit(1)
        const last = await db
          .select()
          .from(messages)
          .where(and(eq(messages.conversationId, row.conversation.id), isNull(messages.deletedAt)))
          .orderBy(desc(messages.createdAt))
          .limit(1)
        const unread = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, row.conversation.id),
              isNull(messages.deletedAt),
              sql`${messages.senderId} <> ${userId}`,
              row.participant.lastReadAt ? sql`${messages.createdAt} > ${row.participant.lastReadAt}` : sql`true`,
            ),
          )
        const other = others[0]
        if (!other) continue
        items.push({
          id: row.conversation.id,
          updatedAt: row.conversation.updatedAt.toISOString(),
          with: authorOf(other.profile, apiOrigin),
          lastMessage: last[0]
            ? { body: last[0].body, createdAt: last[0].createdAt.toISOString() }
            : null,
          unread: Number(unread[0]?.value ?? 0) > 0,
        })
      }
      return { items }
    },

    async listMessages(userId: string, conversationId: string, cursorValue?: string) {
      await requireParticipant(db, conversationId, userId)
      const cursor = decodeCursor(cursorValue)
      const limit = 30
      const rows = await db
        .select({ message: messages, profile: profiles })
        .from(messages)
        .innerJoin(profiles, eq(profiles.userId, messages.senderId))
        .where(
          and(
            eq(messages.conversationId, conversationId),
            isNull(messages.deletedAt),
            cursor
              ? or(
                  lt(messages.createdAt, new Date(cursor.createdAt)),
                  and(eq(messages.createdAt, new Date(cursor.createdAt)), lt(messages.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit).reverse()
      const next = rows[limit]
      return {
        items: page.map((row) => ({
          id: row.message.id,
          body: row.message.body,
          createdAt: row.message.createdAt.toISOString(),
          sender: authorOf(row.profile, apiOrigin),
          mine: row.message.senderId === userId,
        })),
        nextCursor: next ? encodeCursor({ createdAt: next.message.createdAt.toISOString(), id: next.message.id }) : null,
      }
    },

    async sendMessage(userId: string, conversationId: string, bodyInput: string) {
      const participants = await requireParticipant(db, conversationId, userId)
      const other = participants.find((id) => id !== userId)
      if (!other || (await isBlocked(userId, other))) {
        throw new ApiError(403, 'blocked', 'This conversation is not available')
      }
      let body = ''
      try {
        body = cleanText(bodyInput, 2000)
      } catch {
        throw new ApiError(400, 'invalid_message', 'Message must be 1-2000 characters')
      }
      if (!body) throw new ApiError(400, 'invalid_message', 'Message must be 1-2000 characters')
      const inserted = await db
        .insert(messages)
        .values({ conversationId, senderId: userId, body })
        .returning()
      const message = inserted[0]
      if (!message) throw new ApiError(500, 'internal_error', 'Message could not be sent')
      await db
        .update(conversations)
        .set({ updatedAt: options.now() })
        .where(eq(conversations.id, conversationId))
      await notify({
        userId: other,
        actorUserId: userId,
        type: 'message',
        preference: 'messages',
        targetType: 'conversation',
        targetId: conversationId,
        dedupeKey: `message:${message.id}`,
      })
      return { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() }
    },

    async markConversationRead(userId: string, conversationId: string) {
      await requireParticipant(db, conversationId, userId)
      await db
        .update(conversationParticipants)
        .set({ lastReadAt: options.now() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
      return { read: true }
    },

    async listNotifications(userId: string, cursorValue?: string) {
      const cursor = decodeCursor(cursorValue)
      const limit = 30
      const rows = await db
        .select({ notification: notifications, profile: profiles })
        .from(notifications)
        .leftJoin(profiles, eq(profiles.userId, notifications.actorUserId))
        .where(
          and(
            eq(notifications.userId, userId),
            cursor
              ? or(
                  lt(notifications.createdAt, new Date(cursor.createdAt)),
                  and(eq(notifications.createdAt, new Date(cursor.createdAt)), lt(notifications.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const next = rows[limit]
      return {
        items: page.map((row) => ({
          id: row.notification.id,
          type: row.notification.type,
          targetType: row.notification.targetType,
          targetId: row.notification.targetId,
          read: Boolean(row.notification.readAt),
          createdAt: row.notification.createdAt.toISOString(),
          actor: row.profile ? authorOf(row.profile, apiOrigin) : null,
        })),
        nextCursor: next
          ? encodeCursor({ createdAt: next.notification.createdAt.toISOString(), id: next.notification.id })
          : null,
      }
    },

    async markNotification(userId: string, notificationId: string) {
      const updated = await db
        .update(notifications)
        .set({ readAt: options.now() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning()
      if (!updated[0]) throw new ApiError(404, 'notification_not_found', 'Notification was not found')
      return { read: true }
    },

    async markAllNotifications(userId: string) {
      await db
        .update(notifications)
        .set({ readAt: options.now() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      return { read: true }
    },

    async notificationSummary(userId: string) {
      const unread = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      const conversationsUnread = await this.listConversations(userId)
      return {
        unread: Number(unread[0]?.value ?? 0),
        unreadMessages: conversationsUnread.items.filter((item) => item.unread).length,
        realtime: false,
      }
    },

    async getPreferences(userId: string) {
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1)
      const row = rows[0]
      return {
        follows: row?.follows ?? true,
        likes: row?.likes ?? true,
        comments: row?.comments ?? true,
        replies: row?.replies ?? true,
        reposts: row?.reposts ?? true,
        messages: row?.messages ?? true,
        communities: row?.communities ?? true,
      }
    },

    async updatePreferences(userId: string, input: Partial<Record<PrefKey, boolean>>) {
      const current = await this.getPreferences(userId)
      const next = { ...current, ...input }
      await db
        .insert(notificationPreferences)
        .values({ userId, ...next })
        .onConflictDoUpdate({ target: notificationPreferences.userId, set: next })
      return next
    },

    async search(viewerId: string | null, query: string, type: string | undefined) {
      const term = query.trim().toLowerCase()
      if (term.length < 1 || term.length > 80) {
        throw new ApiError(400, 'invalid_query', 'Search text must be 1-80 characters')
      }
      const pattern = `%${escapeLike(term)}%`
      const like = (column: unknown) => sql`lower(${column}) like ${pattern} escape '\\'`
      const wanted = type ?? 'all'
      const result: {
        users: Array<ReturnType<typeof authorOf>>
        posts: PostCard[]
        communities: Array<Awaited<ReturnType<typeof communityCard>>>
        hashtags: string[]
      } = { users: [], posts: [], communities: [], hashtags: [] }
      if (wanted === 'all' || wanted === 'users') {
        const rows = await db
          .select()
          .from(profiles)
          .where(and(eq(profiles.visibility, 'public'), or(like(profiles.username), like(profiles.displayName))))
          .limit(20)
        result.users = []
        for (const row of rows) {
          if (viewerId && (await isBlocked(viewerId, row.userId))) continue
          result.users.push(authorOf(row, apiOrigin))
        }
      }
      if (wanted === 'all' || wanted === 'posts') {
        const rows = await db
          .select({ post: posts, profile: profiles, community: communities })
          .from(posts)
          .innerJoin(profiles, eq(profiles.userId, posts.authorId))
          .leftJoin(communities, eq(communities.id, posts.communityId))
          .where(
            and(
              isNull(posts.deletedAt),
              eq(posts.visibility, 'public'),
              eq(profiles.visibility, 'public'),
              or(isNull(posts.communityId), eq(communities.visibility, 'public')),
              or(like(posts.body), like(profiles.username), like(profiles.displayName)),
            ),
          )
          .orderBy(desc(posts.createdAt))
          .limit(20)
        result.posts = await presentPosts(rows, viewerId)
      }
      if (wanted === 'all' || wanted === 'communities') {
        const list = await this.listCommunities(viewerId, undefined, term)
        result.communities = list.items
      }
      if (wanted === 'all' || wanted === 'hashtags') {
        const rows = await db.select().from(hashtags).where(like(hashtags.tag)).limit(20)
        result.hashtags = rows.map((row) => row.tag)
      }
      return result
    },

    async listReplies(
      viewerId: string | null,
      username: string,
      cursorValue?: string,
      limitValue?: string,
    ): Promise<Page<ProfileReply>> {
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const rows = await db
        .select({ comment: comments, post: posts, profile: profiles, community: communities })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .innerJoin(profiles, eq(profiles.userId, posts.authorId))
        .leftJoin(communities, eq(communities.id, posts.communityId))
        .where(
          and(
            eq(comments.authorId, found.user.id),
            isNull(comments.deletedAt),
            isNull(posts.deletedAt),
            cursor
              ? or(
                  lt(comments.createdAt, new Date(cursor.createdAt)),
                  and(eq(comments.createdAt, new Date(cursor.createdAt)), lt(comments.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(limit + 5)
      const visible: ProfileReply[] = []
      for (const row of rows) {
        if (!(await canViewPost(viewerId, row.post, row.profile, row.community))) continue
        visible.push({
          id: row.comment.id,
          body: row.comment.body,
          createdAt: row.comment.createdAt.toISOString(),
          postId: row.post.id,
        })
        if (visible.length > limit) break
      }
      const page = visible.slice(0, limit)
      const next = visible[limit]
      return {
        items: page,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt, id: next.id }) : null,
      }
    },

    async listLikedPosts(viewerId: string | null, username: string, cursorValue?: string, limitValue?: string) {
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      if (viewerId !== found.user.id) {
        throw new ApiError(403, 'likes_private', 'Likes are visible only to the account owner')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const rows = await db
        .select({ post: posts, profile: profiles, community: communities, createdAt: postLikes.createdAt })
        .from(postLikes)
        .innerJoin(posts, eq(posts.id, postLikes.postId))
        .innerJoin(profiles, eq(profiles.userId, posts.authorId))
        .leftJoin(communities, eq(communities.id, posts.communityId))
        .where(
          and(
            eq(postLikes.userId, found.user.id),
            isNull(posts.deletedAt),
            cursor
              ? or(
                  lt(postLikes.createdAt, new Date(cursor.createdAt)),
                  and(eq(postLikes.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(postLikes.createdAt), desc(posts.id))
        .limit(limit + 1)
      const cards = await presentPosts(rows.slice(0, limit), viewerId)
      const next = rows[limit]
      return {
        items: cards,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.post.id }) : null,
      }
    },

    async listProfileCommunities(
      viewerId: string | null,
      username: string,
      cursorValue?: string,
      limitValue?: string,
    ): Promise<Page<ProfileCommunityCard>> {
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue, 20)
      const rows = await db
        .select({ community: communities, role: communityMembers.role, createdAt: communityMembers.createdAt })
        .from(communityMembers)
        .innerJoin(communities, eq(communities.id, communityMembers.communityId))
        .where(
          and(
            eq(communityMembers.userId, found.user.id),
            or(
              eq(communities.visibility, 'public'),
              viewerId === found.user.id ? sql`true` : sql`false`,
              viewerId
                ? sql`exists (select 1 from community_members m where m.community_id = ${communities.id} and m.user_id = ${viewerId})`
                : sql`false`,
            ),
            cursor
              ? or(
                  lt(communityMembers.createdAt, new Date(cursor.createdAt)),
                  and(eq(communityMembers.createdAt, new Date(cursor.createdAt)), lt(communities.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(communityMembers.createdAt), desc(communities.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const items: ProfileCommunityCard[] = []
      for (const row of page) {
        const count = await db
          .select({ value: sql<number>`count(*)::int` })
          .from(communityMembers)
          .where(eq(communityMembers.communityId, row.community.id))
        items.push({
          slug: row.community.slug,
          name: row.community.name,
          description: row.community.description,
          rules: row.community.rules,
          visibility: row.community.visibility,
          role: row.role,
          memberCount: Number(count[0]?.value ?? 0),
        })
      }
      const next = rows[limit]
      return {
        items,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.community.id }) : null,
      }
    },

    async listActivity(
      viewerId: string | null,
      username: string,
      cursorValue?: string,
      limitValue?: string,
    ): Promise<Page<ActivityItem>> {
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      if (viewerId !== found.user.id) {
        throw new ApiError(403, 'activity_private', 'Activity is visible only to the account owner')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const userId = found.user.id
      const [postRows, commentRows, followRows] = await Promise.all([
        db
          .select({ id: posts.id, at: posts.createdAt, body: posts.body })
          .from(posts)
          .where(
            and(
              eq(posts.authorId, userId),
              isNull(posts.deletedAt),
              cursor
                ? or(
                    lt(posts.createdAt, new Date(cursor.createdAt)),
                    and(eq(posts.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(posts.createdAt), desc(posts.id))
          .limit(limit + 1),
        db
          .select({ id: comments.id, at: comments.createdAt, body: comments.body, postId: comments.postId })
          .from(comments)
          .where(
            and(
              eq(comments.authorId, userId),
              isNull(comments.deletedAt),
              cursor
                ? or(
                    lt(comments.createdAt, new Date(cursor.createdAt)),
                    and(eq(comments.createdAt, new Date(cursor.createdAt)), lt(comments.id, cursor.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(comments.createdAt), desc(comments.id))
          .limit(limit + 1),
        db
          .select({ id: follows.followeeId, at: follows.createdAt, username: profiles.username })
          .from(follows)
          .innerJoin(profiles, eq(profiles.userId, follows.followeeId))
          .where(
            and(
              eq(follows.followerId, userId),
              cursor
                ? or(
                    lt(follows.createdAt, new Date(cursor.createdAt)),
                    and(eq(follows.createdAt, new Date(cursor.createdAt)), lt(follows.followeeId, cursor.id)),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(follows.createdAt), desc(follows.followeeId))
          .limit(limit + 1),
      ])
      const merged: ActivityItem[] = [
        ...postRows.map((row) => ({
          id: row.id,
          kind: 'post' as const,
          createdAt: row.at.toISOString(),
          label: row.body ? row.body.slice(0, 180) : 'Published a post',
          href: `/app/posts/${row.id}`,
        })),
        ...commentRows.map((row) => ({
          id: row.id,
          kind: 'comment' as const,
          createdAt: row.at.toISOString(),
          label: row.body.slice(0, 180),
          href: `/app/posts/${row.postId}`,
        })),
        ...followRows.map((row) => ({
          id: row.id,
          kind: 'follow' as const,
          createdAt: row.at.toISOString(),
          label: `Followed @${row.username}`,
          href: `/app/u/${row.username}`,
        })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1))
      const page = merged.slice(0, limit)
      const next = merged[limit]
      return {
        items: page,
        nextCursor: next ? encodeCursor({ createdAt: next.createdAt, id: next.id }) : null,
      }
    },

    async listMutuals(viewerId: string | null, username: string, cursorValue?: string, limitValue?: string) {
      if (!viewerId) throw new ApiError(401, 'unauthenticated', 'Sign in required')
      const found = await profileByUsername(username)
      if (!found || !(await canViewProfile(viewerId, found.profile))) {
        throw new ApiError(404, 'profile_not_found', 'Profile was not found')
      }
      const cursor = decodeCursor(cursorValue)
      const limit = limited(limitValue)
      const rows = await db
        .select({ profile: profiles, createdAt: follows.createdAt, id: follows.followerId })
        .from(follows)
        .innerJoin(profiles, eq(profiles.userId, follows.followerId))
        .where(
          and(
            eq(follows.followeeId, found.user.id),
            sql`${follows.followerId} in (select followee_id from follows where follower_id = ${viewerId})`,
            cursor
              ? or(
                  lt(follows.createdAt, new Date(cursor.createdAt)),
                  and(eq(follows.createdAt, new Date(cursor.createdAt)), lt(follows.followerId, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(follows.createdAt), desc(follows.followerId))
        .limit(limit + 1)
      const page = await pageFrom(
        rows.map((row) => ({ ...authorOf(row.profile, apiOrigin), createdAt: row.createdAt, id: row.id })),
        limit,
      )
      return {
        items: page.items.map(({ createdAt: _createdAt, id: _id, ...person }) => person),
        nextCursor: page.nextCursor,
      }
    },

    async reportContent(
      userId: string,
      input: { targetType: 'post' | 'comment' | 'profile' | 'community'; targetId: string; reason: string },
    ) {
      let reason = ''
      try {
        reason = cleanText(input.reason, 500)
      } catch {
        throw new ApiError(400, 'invalid_report', 'A report must be 3-500 characters')
      }
      if (reason.length < 3) throw new ApiError(400, 'invalid_report', 'A report must be 3-500 characters')
      let targetId = ''
      if (input.targetType === 'profile') {
        const found = await profileByUsername(input.targetId)
        if (!found || !(await canViewProfile(userId, found.profile))) {
          throw new ApiError(404, 'profile_not_found', 'Profile was not found')
        }
        if (found.user.id === userId) throw new ApiError(400, 'cannot_report_self', 'You cannot report yourself')
        targetId = found.user.id
      } else if (input.targetType === 'community') {
        const community = await communityBySlug(db, input.targetId)
        const member = await membership(community.id, userId)
        if (community.visibility === 'private' && !member) {
          throw new ApiError(404, 'community_not_found', 'Community was not found')
        }
        targetId = community.id
      } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.targetId)) {
        throw new ApiError(400, 'invalid_report', 'That report target was not found')
      } else if (input.targetType === 'post') {
        const row = await requireVisiblePost(input.targetId, userId)
        if (row.post.authorId === userId) throw new ApiError(400, 'cannot_report_self', 'You cannot report your own post')
        targetId = row.post.id
      } else if (input.targetType === 'comment') {
        const rows = await db
          .select({ comment: comments, post: posts, profile: profiles, community: communities })
          .from(comments)
          .innerJoin(posts, eq(posts.id, comments.postId))
          .innerJoin(profiles, eq(profiles.userId, posts.authorId))
          .leftJoin(communities, eq(communities.id, posts.communityId))
          .where(eq(comments.id, input.targetId))
          .limit(1)
        const row = rows[0]
        if (!row || row.comment.deletedAt || !(await canViewPost(userId, row.post, row.profile, row.community))) {
          throw new ApiError(404, 'comment_not_found', 'Comment was not found')
        }
        if (row.comment.authorId === userId) {
          throw new ApiError(400, 'cannot_report_self', 'You cannot report your own comment')
        }
        targetId = row.comment.id
      }
      await db
        .insert(contentReports)
        .values({ reporterId: userId, targetType: input.targetType, targetId, reason })
        .onConflictDoNothing()
      await writeAudit(db, {
        actorUserId: userId,
        action: 'content.reported',
        targetType: input.targetType,
        targetId,
      })
      return { reported: true }
    },

    async chainStatus(): Promise<ChainStatus> {
      const rows = await db.select({ value: sql<number>`count(*)::int` }).from(chainProgramEvents)
      return {
        creatorRegistration: 'not_enabled',
        tips: 'not_enabled',
        message:
          'On-chain creator registration and SOL or ETH tips are not enabled. Program deployments have no recorded signature.',
        indexedEventCount: Number(rows[0]?.value ?? 0),
      }
    },

    async authorizeMedia(key: string, viewerId: string | null) {
      const assetRows = await db.select().from(mediaAssets).where(eq(mediaAssets.storageKey, key)).limit(1)
      const asset = assetRows[0]
      if (asset) {
        const links = await db.select().from(postMedia).where(eq(postMedia.assetId, asset.id)).limit(1)
        if (!links[0]) {
          if (asset.ownerUserId !== viewerId) throw new ApiError(404, 'media_not_found', 'Media was not found')
          return
        }
        await requireVisiblePost(links[0].postId, viewerId)
        return
      }
      const profileRows = await db
        .select()
        .from(profiles)
        .where(or(eq(profiles.avatarStorageKey, key), eq(profiles.coverStorageKey, key)))
        .limit(1)
      if (profileRows[0]) {
        if (!(await canViewProfile(viewerId, profileRows[0]))) {
          throw new ApiError(404, 'media_not_found', 'Media was not found')
        }
        return
      }
      const communityRows = await db
        .select()
        .from(communities)
        .where(or(eq(communities.avatarStorageKey, key), eq(communities.coverStorageKey, key)))
        .limit(1)
      if (communityRows[0]) {
        const member = await membership(communityRows[0].id, viewerId)
        if (communityRows[0].visibility === 'private' && !member) {
          throw new ApiError(404, 'media_not_found', 'Media was not found')
        }
        return
      }
      throw new ApiError(404, 'media_not_found', 'Media was not found')
    },
  }
}

function safeUrl(value: string): string {
  try {
    return httpUrl(value)
  } catch {
    throw new ApiError(400, 'invalid_url', 'Link must be an http or https URL')
  }
}

async function communityBySlug(db: Database, slug: string) {
  const rows = await db
    .select()
    .from(communities)
    .where(sql`lower(${communities.slug}) = ${slug.toLowerCase()}`)
    .limit(1)
  const community = rows[0]
  if (!community) throw new ApiError(404, 'community_not_found', 'Community was not found')
  return community
}

async function communityCard(
  db: Database,
  community: typeof communities.$inferSelect,
  viewerId: string | null,
  apiOrigin: string,
) {
  const memberRows = viewerId
    ? await db
        .select()
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, viewerId)))
        .limit(1)
    : []
  const count = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, community.id))
  const owner = await db.select().from(profiles).where(eq(profiles.userId, community.ownerId)).limit(1)
  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description,
    rules: community.rules,
    visibility: community.visibility,
    createdAt: community.createdAt.toISOString(),
    avatarUrl: mediaUrl(apiOrigin, community.avatarStorageKey),
    coverUrl: mediaUrl(apiOrigin, community.coverStorageKey),
    memberCount: Number(count[0]?.value ?? 0),
    ownerUsername: owner[0]?.username ?? null,
    viewerRole: memberRows[0]?.role ?? null,
  }
}

async function commentCard(
  db: Database,
  commentId: string,
  viewerId: string | null,
  apiOrigin: string,
): Promise<CommentCard | null> {
  const rows = await db
    .select({ comment: comments, profile: profiles })
    .from(comments)
    .innerJoin(profiles, eq(profiles.userId, comments.authorId))
    .where(eq(comments.id, commentId))
    .limit(1)
  const row = rows[0]
  if (!row || row.comment.deletedAt) return null
  const likeCount = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(commentLikes)
    .where(eq(commentLikes.commentId, commentId))
  const mine = viewerId
    ? await db
        .select()
        .from(commentLikes)
        .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, viewerId)))
        .limit(1)
    : []
  const replies = row.comment.parentId
    ? []
    : await db
        .select()
        .from(comments)
        .where(and(eq(comments.parentId, commentId), isNull(comments.deletedAt)))
        .orderBy(asc(comments.createdAt))
        .limit(20)
  const replyCards: CommentCard[] = []
  for (const reply of replies) {
    const card = await commentCard(db, reply.id, viewerId, apiOrigin)
    if (card) replyCards.push(card)
  }
  return {
    id: row.comment.id,
    body: row.comment.body,
    createdAt: row.comment.createdAt.toISOString(),
    editedAt: row.comment.editedAt ? row.comment.editedAt.toISOString() : null,
    parentId: row.comment.parentId,
    author: authorOf(row.profile, apiOrigin),
    likeCount: Number(likeCount[0]?.value ?? 0),
    viewerLiked: Boolean(mine[0]),
    replies: replyCards,
  }
}

async function requireParticipant(db: Database, conversationId: string, userId: string) {
  const rows = await db
    .select()
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId))
  if (!rows.some((row) => row.userId === userId)) {
    throw new ApiError(404, 'conversation_not_found', 'Conversation was not found')
  }
  return rows.map((row) => row.userId)
}

async function followingFeed(
  db: Database,
  viewerId: string,
  cursor: Cursor | null,
  limit: number,
  present: SocialPresent,
): Promise<Page<PostCard>> {
  const rows = await db
    .select({ post: posts, profile: profiles, community: communities })
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .leftJoin(communities, eq(communities.id, posts.communityId))
    .where(
      and(
        isNull(posts.deletedAt),
        sql`(
          ${posts.authorId} = ${viewerId}
          or ${posts.authorId} in (select followee_id from follows where follower_id = ${viewerId})
          or ${posts.id} in (
            select post_id from post_reposts
            where user_id = ${viewerId}
               or user_id in (select followee_id from follows where follower_id = ${viewerId})
          )
        )`,
        sql`not exists (
          select 1 from user_blocks b
          where (b.blocker_id = ${viewerId} and b.blocked_id = ${posts.authorId})
             or (b.blocked_id = ${viewerId} and b.blocker_id = ${posts.authorId})
        )`,
        cursor
          ? or(
              lt(posts.createdAt, new Date(cursor.createdAt)),
              and(eq(posts.createdAt, new Date(cursor.createdAt)), lt(posts.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1)
  const cards = await present(rows.slice(0, limit), viewerId)
  const next = rows[limit]
  return {
    items: cards,
    nextCursor: next ? encodeCursor({ createdAt: next.post.createdAt.toISOString(), id: next.post.id }) : null,
  }
}

type SocialPresent = (
  rows: Array<{
    post: typeof posts.$inferSelect
    profile: typeof profiles.$inferSelect
    community: typeof communities.$inferSelect | null
  }>,
  viewerId: string | null,
) => Promise<PostCard[]>

export type SocialService = ReturnType<typeof createSocialService>
