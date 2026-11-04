import { and, desc, eq, gte, sql } from 'drizzle-orm'
import {
  comments,
  communities,
  communityChannels,
  communityMembers,
  follows,
  hashtags,
  pollOptions,
  pollVotes,
  polls,
  postDrafts,
  postHashtags,
  postLikes,
  postReposts,
  posts,
  profiles,
  type Database,
} from '@erax/database'
import { ApiError } from './errors'

export type StudioRange = '7d' | '30d' | '90d' | 'all'

function windowStart(range: StudioRange, now: Date): Date | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function createProductService(db: Database, now: () => Date = () => new Date()) {
  return {
    async studio(userId: string, range: StudioRange) {
      const start = windowStart(range, now())
      const postFilter = and(eq(posts.authorId, userId), sql`${posts.deletedAt} is null`, start ? gte(posts.createdAt, start) : undefined)
      const [postCount] = await db.select({ value: sql<number>`count(*)::int` }).from(posts).where(postFilter)
      const [likeCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(postLikes)
        .innerJoin(posts, eq(posts.id, postLikes.postId))
        .where(postFilter)
      const [commentCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .where(and(postFilter, sql`${comments.deletedAt} is null`))
      const [repostCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(postReposts)
        .innerJoin(posts, eq(posts.id, postReposts.postId))
        .where(postFilter)
      const [followerTotal] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followeeId, userId))
      const followFilter = and(eq(follows.followeeId, userId), start ? gte(follows.createdAt, start) : undefined)
      const [followerGained] = await db.select({ value: sql<number>`count(*)::int` }).from(follows).where(followFilter)
      const top = await db
        .select({
          id: posts.id,
          body: posts.body,
          likes: sql<number>`(select count(*)::int from post_likes where post_id = ${posts.id})`,
        })
        .from(posts)
        .where(postFilter)
        .orderBy(sql`(select count(*) from post_likes where post_id = ${posts.id}) desc`, desc(posts.createdAt))
        .limit(5)
      return {
        range,
        followers: { total: Number(followerTotal?.value ?? 0), gainedInRange: Number(followerGained?.value ?? 0) },
        posts: Number(postCount?.value ?? 0),
        likes: Number(likeCount?.value ?? 0),
        replies: Number(commentCount?.value ?? 0),
        reposts: Number(repostCount?.value ?? 0),
        topPosts: top.map((row) => ({ id: row.id, body: row.body.slice(0, 160), likes: Number(row.likes) })),
        unavailable: ['impressions', 'reach', 'watchTime'],
      }
    },

    async listDrafts(userId: string) {
      const rows = await db
        .select()
        .from(postDrafts)
        .where(eq(postDrafts.authorId, userId))
        .orderBy(desc(postDrafts.updatedAt))
      return { items: rows }
    },

    async saveDraft(userId: string, input: { id?: string; body: string; linkUrl?: string | null }) {
      const body = input.body.trim()
      if (body.length > 2000) throw new ApiError(400, 'invalid_draft', 'A draft must be 2000 characters or fewer')
      if (input.id) {
        const updated = await db
          .update(postDrafts)
          .set({ body, linkUrl: input.linkUrl ?? null, updatedAt: now() })
          .where(and(eq(postDrafts.id, input.id), eq(postDrafts.authorId, userId)))
          .returning()
        if (!updated[0]) throw new ApiError(404, 'draft_not_found', 'Draft was not found')
        return updated[0]
      }
      const inserted = await db.insert(postDrafts).values({ authorId: userId, body, linkUrl: input.linkUrl ?? null }).returning()
      const draft = inserted[0]
      if (!draft) throw new ApiError(500, 'internal_error', 'Draft was not saved')
      return draft
    },

    async deleteDraft(userId: string, id: string) {
      const removed = await db
        .delete(postDrafts)
        .where(and(eq(postDrafts.id, id), eq(postDrafts.authorId, userId)))
        .returning()
      if (!removed[0]) throw new ApiError(404, 'draft_not_found', 'Draft was not found')
      return { deleted: true }
    },

    async takeDraft(userId: string, id: string) {
      const rows = await db
        .select()
        .from(postDrafts)
        .where(and(eq(postDrafts.id, id), eq(postDrafts.authorId, userId)))
        .limit(1)
      const draft = rows[0]
      if (!draft) throw new ApiError(404, 'draft_not_found', 'Draft was not found')
      await db.delete(postDrafts).where(eq(postDrafts.id, draft.id))
      return draft
    },

    async attachPoll(userId: string, postId: string, input: { options: string[]; closesAt?: string | null }) {
      const owned = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.authorId, userId))).limit(1)
      if (!owned[0] || owned[0].deletedAt) throw new ApiError(404, 'post_not_found', 'Post was not found')
      const labels = input.options.map((option) => option.trim()).filter(Boolean)
      if (labels.length < 2 || labels.length > 6) throw new ApiError(400, 'invalid_poll', 'A poll needs 2 to 6 options')
      if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) {
        throw new ApiError(400, 'invalid_poll', 'Poll options must be different')
      }
      const closesAt = input.closesAt ? new Date(input.closesAt) : null
      if (closesAt && Number.isNaN(closesAt.getTime())) throw new ApiError(400, 'invalid_poll', 'Poll close time is invalid')
      await db.transaction(async (tx) => {
        await tx.insert(polls).values({ postId, closesAt })
        for (const [position, label] of labels.entries()) {
          await tx.insert(pollOptions).values({ postId, label, position })
        }
      })
      return this.poll(postId, userId)
    },

    async poll(postId: string, viewerId: string | null) {
      const pollRows = await db.select().from(polls).where(eq(polls.postId, postId)).limit(1)
      const poll = pollRows[0]
      if (!poll) return null
      const options = await db.select().from(pollOptions).where(eq(pollOptions.postId, postId)).orderBy(pollOptions.position)
      const counts = await db
        .select({ optionId: pollVotes.optionId, value: sql<number>`count(*)::int` })
        .from(pollVotes)
        .where(eq(pollVotes.postId, postId))
        .groupBy(pollVotes.optionId)
      const mine = viewerId
        ? await db.select().from(pollVotes).where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, viewerId))).limit(1)
        : []
      const closed = poll.closesAt !== null && poll.closesAt.getTime() <= now().getTime()
      return {
        postId,
        closesAt: poll.closesAt?.toISOString() ?? null,
        closed,
        viewerOptionId: mine[0]?.optionId ?? null,
        options: options.map((option) => ({
          id: option.id,
          label: option.label,
          votes: Number(counts.find((count) => count.optionId === option.id)?.value ?? 0),
        })),
      }
    },

    async vote(userId: string, postId: string, optionId: string) {
      const current = await this.poll(postId, userId)
      if (!current) throw new ApiError(404, 'poll_not_found', 'This post has no poll')
      if (current.closed) throw new ApiError(400, 'poll_closed', 'This poll has ended')
      if (!current.options.some((option) => option.id === optionId)) {
        throw new ApiError(400, 'invalid_vote', 'That option is not on this poll')
      }
      await db.transaction(async (tx) => {
        await tx.delete(pollVotes).where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, userId)))
        await tx.insert(pollVotes).values({ postId, userId, optionId })
      })
      return this.poll(postId, userId)
    },

    async createChannel(userId: string, slug: string, input: { name: string; channelSlug: string }) {
      const communityRows = await db
        .select()
        .from(communities)
        .where(sql`lower(${communities.slug}) = ${slug.toLowerCase()}`)
        .limit(1)
      const community = communityRows[0]
      if (!community) throw new ApiError(404, 'community_not_found', 'Community was not found')
      const member = await db
        .select()
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, userId)))
        .limit(1)
      if (!member[0] || (member[0].role !== 'owner' && member[0].role !== 'moderator')) {
        throw new ApiError(403, 'forbidden', 'Only an owner or moderator can add a channel')
      }
      const name = input.name.trim()
      const channelSlug = input.channelSlug.trim().toLowerCase()
      if (!/^[a-z0-9-]{2,40}$/.test(channelSlug)) throw new ApiError(400, 'invalid_channel', 'Use a short channel slug')
      const inserted = await db
        .insert(communityChannels)
        .values({ communityId: community.id, name, slug: channelSlug })
        .returning()
      return inserted[0]
    },

    async listChannels(slug: string) {
      const communityRows = await db
        .select()
        .from(communities)
        .where(sql`lower(${communities.slug}) = ${slug.toLowerCase()}`)
        .limit(1)
      const community = communityRows[0]
      if (!community || community.visibility !== 'public') throw new ApiError(404, 'community_not_found', 'Community was not found')
      const items = await db
        .select()
        .from(communityChannels)
        .where(eq(communityChannels.communityId, community.id))
        .orderBy(communityChannels.createdAt)
      return { items }
    },

    async setPostFlags(
      userId: string,
      postId: string,
      input: { pinned?: boolean; locked?: boolean; featured?: boolean },
    ) {
      const rows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1)
      const post = rows[0]
      if (!post || post.deletedAt) throw new ApiError(404, 'post_not_found', 'Post was not found')
      const patch: { pinnedAt?: Date | null; locked?: boolean; featured?: boolean; updatedAt: Date } = { updatedAt: now() }
      if (input.featured !== undefined) {
        if (post.authorId !== userId) throw new ApiError(403, 'forbidden', 'Only the author can feature a post')
        patch.featured = input.featured
      }
      if (input.pinned !== undefined || input.locked !== undefined) {
        if (!post.communityId) throw new ApiError(400, 'invalid_post', 'Pin and lock apply to community posts')
        const member = await db
          .select()
          .from(communityMembers)
          .where(and(eq(communityMembers.communityId, post.communityId), eq(communityMembers.userId, userId)))
          .limit(1)
        if (!member[0] || (member[0].role !== 'owner' && member[0].role !== 'moderator')) {
          throw new ApiError(403, 'forbidden', 'Only an owner or moderator can pin or lock a post')
        }
        if (input.pinned !== undefined) patch.pinnedAt = input.pinned ? now() : null
        if (input.locked !== undefined) patch.locked = input.locked
      }
      await db.update(posts).set(patch).where(eq(posts.id, postId))
      return { updated: true }
    },

    async discovery() {
      const since = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000)
      const topics = await db
        .select({ tag: hashtags.tag, posts: sql<number>`count(*)::int` })
        .from(postHashtags)
        .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
        .innerJoin(posts, eq(posts.id, postHashtags.postId))
        .where(and(sql`${posts.deletedAt} is null`, eq(posts.visibility, 'public'), gte(posts.createdAt, since)))
        .groupBy(hashtags.tag)
        .orderBy(sql`count(*) desc`)
        .limit(8)
      const creators = await db
        .select({
          username: profiles.username,
          displayName: profiles.displayName,
          followers: sql<number>`(select count(*)::int from follows where followee_id = ${profiles.userId})`,
        })
        .from(profiles)
        .where(eq(profiles.visibility, 'public'))
        .orderBy(sql`(select count(*) from follows where followee_id = ${profiles.userId}) desc`)
        .limit(5)
      return {
        rule: 'Topics count public posts from the last 7 days. Creators are ordered by follower count.',
        topics: topics.map((topic) => ({ tag: topic.tag, posts: Number(topic.posts) })),
        creators: creators.map((creator) => ({ ...creator, followers: Number(creator.followers) })),
      }
    },
  }
}
