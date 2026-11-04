import { hashPassword, normalizeEmail } from '@erax/auth'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  assertDemoFixture,
  DEMO_BATCH,
  DEMO_PASSWORD,
  demoBookmarks,
  demoComments,
  demoCommunities,
  demoFollows,
  demoLikes,
  demoMemberships,
  demoPeople,
  demoPlan,
  demoPosts,
  demoReposts,
  demoVotes,
  mentionsIn,
  tagsIn,
} from '../seeds/socialfi-demo-content'
import type { Database } from './client'
import {
  comments,
  communities,
  communityMembers,
  demoMarks,
  follows,
  hashtags,
  pollOptions,
  polls,
  pollVotes,
  postBookmarks,
  postHashtags,
  postLikes,
  postReposts,
  posts,
  profiles,
  userMentions,
  users,
} from './schema'
import { assertLocalSeedTarget, describeDatabaseUrl } from './target'

export type DemoSeedTarget = 'local' | 'staging' | 'production'

const PRODUCTION_CONFIRM = 'seed-socialfi-demo-production'

export function assertDemoSeedAllowed(input: {
  nodeEnv: string | undefined
  driver: string
  databaseUrl: string
  target: DemoSeedTarget
  confirm?: string
  stagingFlag?: string
}): void {
  if (input.target === 'production') {
    if (input.confirm !== PRODUCTION_CONFIRM) {
      throw new Error(
        'Refusing to seed demo content against production. The production command is not the default. Pass --confirm=seed-socialfi-demo-production only for an intentional production write.',
      )
    }
    return
  }
  if (input.nodeEnv === 'production') {
    throw new Error(
      'Refusing demo seed because NODE_ENV=production. Use the production command with the confirm flag. It is not the default.',
    )
  }
  if (input.target === 'local') {
    if (input.driver === 'pglite') return
    assertLocalSeedTarget(input.databaseUrl)
    return
  }
  if (input.driver === 'pglite') {
    throw new Error('Staging demo seed refuses PGlite. Point DATABASE_URL at the staging Postgres database.')
  }
  const remote = describeDatabaseUrl(input.databaseUrl)
  if (remote.local) throw new Error('Staging demo seed refuses a local database. Use the local command.')
  if (input.stagingFlag !== '1') {
    throw new Error('Set ERAX_DEMO_SEED_STAGING=1 to confirm this remote database is staging.')
  }
}

async function idsFor(db: Database, batch: string, entityType: 'user' | 'post' | 'community' | 'comment') {
  const rows = await db
    .select({ id: demoMarks.entityId })
    .from(demoMarks)
    .where(and(eq(demoMarks.batch, batch), eq(demoMarks.entityType, entityType)))
  return rows.map((row) => row.id)
}

async function counted(db: Database, query: Promise<Array<{ value: number | null }>>) {
  const rows = await query
  return Number(rows[0]?.value ?? 0)
}

export async function countSocialDemo(db: Database, batch = DEMO_BATCH) {
  const [userIds, postIds, commentIds, communityIds] = await Promise.all([
    idsFor(db, batch, 'user'),
    idsFor(db, batch, 'post'),
    idsFor(db, batch, 'comment'),
    idsFor(db, batch, 'community'),
  ])
  const empty = userIds.length === 0 || postIds.length === 0
  const likes = empty
    ? 0
    : await counted(db, db.select({ value: sql<number>`count(*)::int` }).from(postLikes).where(inArray(postLikes.postId, postIds)))
  const reposts = empty
    ? 0
    : await counted(
        db,
        db.select({ value: sql<number>`count(*)::int` }).from(postReposts).where(inArray(postReposts.postId, postIds)),
      )
  const bookmarks = empty
    ? 0
    : await counted(
        db,
        db.select({ value: sql<number>`count(*)::int` }).from(postBookmarks).where(inArray(postBookmarks.postId, postIds)),
      )
  const followCount = empty
    ? 0
    : await counted(
        db,
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(follows)
          .where(and(inArray(follows.followerId, userIds), inArray(follows.followeeId, userIds))),
      )
  const memberships = empty
    ? 0
    : await counted(
        db,
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(communityMembers)
          .where(inArray(communityMembers.communityId, communityIds)),
      )
  const pollCount = empty
    ? 0
    : await counted(db, db.select({ value: sql<number>`count(*)::int` }).from(polls).where(inArray(polls.postId, postIds)))
  const voteCount = empty
    ? 0
    : await counted(db, db.select({ value: sql<number>`count(*)::int` }).from(pollVotes).where(inArray(pollVotes.postId, postIds)))
  const hashtagCount = empty
    ? 0
    : await counted(
        db,
        db
          .select({ value: sql<number>`count(distinct ${postHashtags.hashtagId})::int` })
          .from(postHashtags)
          .where(inArray(postHashtags.postId, postIds)),
      )
  return {
    batch,
    users: userIds.length,
    posts: postIds.length,
    comments: commentIds.length,
    communities: communityIds.length,
    likes,
    reposts,
    bookmarks,
    follows: followCount,
    memberships,
    polls: pollCount,
    votes: voteCount,
    hashtags: hashtagCount,
  }
}

export async function seedSocialDemo(db: Database, now = new Date()) {
  assertDemoFixture()
  const plan = demoPlan()
  const existingPosts = (await idsFor(db, DEMO_BATCH, 'post')).length
  if (existingPosts >= plan.posts) {
    return { seeded: false, reason: 'already-present', ...(await countSocialDemo(db)) }
  }
  if (existingPosts > 0) {
    throw new Error('A partial social demo batch exists. Run the demo cleanup before seeding again.')
  }
  for (const person of demoPeople) {
    const rows = await db
      .select({ id: profiles.userId })
      .from(profiles)
      .where(sql`lower(${profiles.username}) = ${person.username}`)
      .limit(1)
    if (rows[0]) {
      throw new Error(`Refusing to overwrite existing username ${person.username}. It is not part of an empty demo batch.`)
    }
  }

  const plannedPosts = demoPosts()
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  await db.transaction(async (tx) => {
    const userIds = new Map<string, string>()
    for (const person of demoPeople) {
      const inserted = await tx
        .insert(users)
        .values({
          email: normalizeEmail(`${person.username}@demo.erax.invalid`),
          passwordHash,
          role: 'user',
          status: 'active',
          emailVerifiedAt: now,
        })
        .returning()
      const user = inserted[0]
      if (!user) throw new Error('Demo user insert failed')
      await tx.insert(profiles).values({
        userId: user.id,
        username: person.username,
        displayName: person.displayName,
        bio: person.bio,
        location: person.location,
        website: person.website,
        creatorStatus: person.creator ? 'creator' : 'none',
        socialLinks: [{ label: 'Example', url: person.website }],
      })
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'user', entityId: user.id })
      userIds.set(person.username, user.id)
    }

    const communityIds = new Map<string, string>()
    for (const community of demoCommunities) {
      const ownerId = userIds.get(community.owner)
      if (!ownerId) throw new Error(`Demo community owner missing: ${community.owner}`)
      const inserted = await tx
        .insert(communities)
        .values({
          ownerId,
          name: community.name,
          slug: community.slug,
          description: community.description,
          rules: community.rules,
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Demo community insert failed')
      communityIds.set(community.slug, row.id)
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'community', entityId: row.id })
    }
    for (const membership of demoMemberships()) {
      const communityId = communityIds.get(membership.slug)
      const userId = userIds.get(membership.username)
      if (!communityId || !userId) throw new Error('Demo membership is missing a community or user')
      await tx.insert(communityMembers).values({ communityId, userId, role: membership.role })
    }

    const postIds: string[] = []
    for (const [index, post] of plannedPosts.entries()) {
      const authorId = userIds.get(post.author)
      if (!authorId) throw new Error(`Demo author missing: ${post.author}`)
      const communityId = post.communitySlug ? communityIds.get(post.communitySlug) : null
      if (post.communitySlug && !communityId) throw new Error(`Demo community missing: ${post.communitySlug}`)
      const inserted = await tx
        .insert(posts)
        .values({
          authorId,
          communityId,
          body: post.body,
          linkUrl: post.linkUrl,
          visibility: 'public',
          featured: index === 75 || index === 80 || index === 85,
          createdAt: new Date(now.getTime() - (plannedPosts.length - index) * 60 * 60 * 1000),
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Demo post insert failed')
      postIds.push(row.id)
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'post', entityId: row.id })
    }
    for (const [index, post] of plannedPosts.entries()) {
      if (post.quoteOf === null) continue
      const quotePostId = postIds[post.quoteOf]
      const postId = postIds[index]
      if (!quotePostId || !postId) throw new Error('Demo quote is missing a post')
      await tx.update(posts).set({ quotePostId }).where(eq(posts.id, postId))
    }

    const tagIds = new Map<string, string>()
    for (const [index, post] of plannedPosts.entries()) {
      const postId = postIds[index]
      const authorId = userIds.get(post.author)
      if (!postId || !authorId) throw new Error('Demo tag source is missing')
      for (const tag of tagsIn(post.body)) {
        let hashtagId = tagIds.get(tag)
        if (!hashtagId) {
          const existing = await tx.select({ id: hashtags.id }).from(hashtags).where(eq(hashtags.tag, tag)).limit(1)
          hashtagId = existing[0]?.id
          if (!hashtagId) {
            const inserted = await tx.insert(hashtags).values({ tag }).returning()
            hashtagId = inserted[0]?.id
          }
          if (!hashtagId) throw new Error(`Demo hashtag failed: ${tag}`)
          tagIds.set(tag, hashtagId)
        }
        await tx.insert(postHashtags).values({ postId, hashtagId })
      }
      for (const username of mentionsIn(post.body)) {
        const mentionedUserId = userIds.get(username)
        if (!mentionedUserId || mentionedUserId === authorId) continue
        await tx.insert(userMentions).values({ postId, mentionedUserId })
      }
    }

    const commentIdsByPost = new Map<number, string[]>()
    for (const comment of demoComments()) {
      const postId = postIds[comment.postIndex]
      const authorId = userIds.get(comment.author)
      if (!postId || !authorId) throw new Error('Demo comment is missing a post or author')
      const siblings = commentIdsByPost.get(comment.postIndex) ?? []
      const parentId = comment.parentSlot === null ? null : siblings[comment.parentSlot]
      if (comment.parentSlot !== null && !parentId) throw new Error('Demo reply is missing its parent comment')
      const post = plannedPosts[comment.postIndex]
      const inserted = await tx
        .insert(comments)
        .values({
          postId,
          authorId,
          parentId,
          body: comment.body,
          createdAt: new Date(now.getTime() - (plannedPosts.length - comment.postIndex) * 60 * 60 * 1000 + siblings.length * 60 * 1000),
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Demo comment insert failed')
      if (post && comment.body.length > 1000) throw new Error('Demo comment exceeded the database limit')
      siblings.push(row.id)
      commentIdsByPost.set(comment.postIndex, siblings)
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'comment', entityId: row.id })
    }

    for (const like of demoLikes()) {
      const postId = postIds[like.postIndex]
      const userId = userIds.get(demoPeople[like.userIndex]?.username ?? '')
      if (!postId || !userId) throw new Error('Demo like is missing a post or user')
      await tx.insert(postLikes).values({ postId, userId })
    }
    for (const repost of demoReposts()) {
      const postId = postIds[repost.postIndex]
      const userId = userIds.get(demoPeople[repost.userIndex]?.username ?? '')
      if (!postId || !userId) throw new Error('Demo repost is missing a post or user')
      await tx.insert(postReposts).values({ postId, userId })
    }
    for (const bookmark of demoBookmarks()) {
      const postId = postIds[bookmark.postIndex]
      const userId = userIds.get(demoPeople[bookmark.userIndex]?.username ?? '')
      if (!postId || !userId) throw new Error('Demo bookmark is missing a post or user')
      await tx.insert(postBookmarks).values({ postId, userId })
    }
    for (const follow of demoFollows()) {
      const followerId = userIds.get(follow.follower)
      const followeeId = userIds.get(follow.followee)
      if (!followerId || !followeeId) throw new Error('Demo follow is missing a person')
      await tx.insert(follows).values({ followerId, followeeId })
    }

    for (const [index, post] of plannedPosts.entries()) {
      if (!post.poll) continue
      const postId = postIds[index]
      if (!postId) throw new Error('Demo poll is missing a post')
      const closesAt =
        post.poll.closesInDays < 0
          ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + post.poll.closesInDays * 24 * 60 * 60 * 1000)
      await tx.insert(polls).values({ postId, closesAt })
      const optionIds: string[] = []
      for (const [position, label] of post.poll.options.entries()) {
        const inserted = await tx.insert(pollOptions).values({ postId, label, position }).returning()
        const option = inserted[0]
        if (!option) throw new Error('Demo poll option insert failed')
        optionIds.push(option.id)
      }
      for (const vote of demoVotes().filter((item) => item.postIndex === index)) {
        const userId = userIds.get(demoPeople[vote.userIndex]?.username ?? '')
        const optionId = optionIds[vote.optionIndex]
        if (!userId || !optionId) throw new Error('Demo vote is missing a user or option')
        await tx.insert(pollVotes).values({
          postId,
          userId,
          optionId,
          createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        })
      }
    }
  })
  return { seeded: true, reason: 'inserted', ...(await countSocialDemo(db)) }
}

async function deleteMarked(
  tx: Pick<Database, 'delete'>,
  table: typeof users | typeof posts | typeof communities | typeof comments,
  ids: string[],
) {
  if (ids.length === 0) return 0
  const removed = await tx.delete(table).where(inArray(table.id, ids)).returning({ id: table.id })
  return removed.length
}

export async function cleanupSocialDemo(db: Database, batch = DEMO_BATCH) {
  const tags = [...new Set(demoPosts().flatMap((post) => tagsIn(post.body)))]
  return db.transaction(async (tx) => {
    const marks = await tx.select().from(demoMarks).where(eq(demoMarks.batch, batch))
    const ids = (type: 'user' | 'post' | 'community' | 'comment') =>
      marks.filter((mark) => mark.entityType === type).map((mark) => mark.entityId)
    const commentsRemoved = await deleteMarked(tx, comments, ids('comment'))
    const postsRemoved = await deleteMarked(tx, posts, ids('post'))
    const communitiesRemoved = await deleteMarked(tx, communities, ids('community'))
    const usersRemoved = await deleteMarked(tx, users, ids('user'))
    if (tags.length > 0) {
      await tx
        .delete(hashtags)
        .where(
          and(
            inArray(hashtags.tag, tags),
            sql`not exists (select 1 from post_hashtags where post_hashtags.hashtag_id = ${hashtags.id})`,
          ),
        )
    }
    if (marks.length > 0) await tx.delete(demoMarks).where(eq(demoMarks.batch, batch))
    return { batch, marks: marks.length, comments: commentsRemoved, posts: postsRemoved, communities: communitiesRemoved, users: usersRemoved }
  })
}
