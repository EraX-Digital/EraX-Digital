import { hashPassword, normalizeEmail } from '@erax/auth'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  DEMO_BATCH,
  DEMO_PASSWORD,
  demoComments,
  demoCommunities,
  demoPeople,
  demoPosts,
} from '../seeds/socialfi-demo-content'
import type { Database } from './client'
import {
  comments,
  communities,
  communityMembers,
  demoMarks,
  follows,
  postLikes,
  posts,
  profiles,
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

async function markedCount(db: Database, entityType: 'user' | 'post' | 'community' | 'comment'): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(demoMarks)
    .where(and(eq(demoMarks.batch, DEMO_BATCH), eq(demoMarks.entityType, entityType)))
  return Number(rows[0]?.value ?? 0)
}

export async function seedSocialDemo(db: Database, now = new Date()) {
  const postsAlready = await markedCount(db, 'post')
  if (postsAlready >= demoPosts().length) {
    return {
      seeded: false,
      reason: 'already-present',
      batch: DEMO_BATCH,
      users: await markedCount(db, 'user'),
      posts: postsAlready,
      communities: await markedCount(db, 'community'),
      comments: await markedCount(db, 'comment'),
    }
  }
  if (postsAlready > 0) {
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
  const summary = await db.transaction(async (tx) => {
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
    for (const [index, community] of demoCommunities.entries()) {
      const ownerName = demoPeople[index % demoPeople.length]?.username
      const ownerId = ownerName ? userIds.get(ownerName) : undefined
      if (!ownerId) throw new Error('Demo community owner missing')
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
      for (const person of demoPeople) {
        const userId = userIds.get(person.username)
        if (!userId) continue
        await tx.insert(communityMembers).values({
          communityId: row.id,
          userId,
          role: userId === ownerId ? 'owner' : 'member',
        })
      }
    }

    const postIds: string[] = []
    for (const post of plannedPosts) {
      const authorId = userIds.get(post.author)
      if (!authorId) throw new Error(`Demo author missing: ${post.author}`)
      const inserted = await tx
        .insert(posts)
        .values({
          authorId,
          communityId: post.communitySlug ? communityIds.get(post.communitySlug) : null,
          body: post.body,
          visibility: 'public',
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Demo post insert failed')
      postIds.push(row.id)
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'post', entityId: row.id })
    }

    let commentCount = 0
    for (const comment of demoComments) {
      const authorId = userIds.get(comment.author)
      const postId = postIds[comment.postIndex]
      if (!authorId || !postId) continue
      const inserted = await tx
        .insert(comments)
        .values({ postId, authorId, body: comment.body })
        .returning()
      const row = inserted[0]
      if (!row) continue
      commentCount += 1
      await tx.insert(demoMarks).values({ batch: DEMO_BATCH, entityType: 'comment', entityId: row.id })
    }

    for (let index = 0; index < demoPeople.length; index += 1) {
      const follower = userIds.get(demoPeople[index]?.username ?? '')
      const followee = userIds.get(demoPeople[(index + 1) % demoPeople.length]?.username ?? '')
      if (!follower || !followee) continue
      await tx.insert(follows).values({ followerId: follower, followeeId: followee })
    }
    for (let index = 0; index < 12; index += 1) {
      const userId = userIds.get(demoPeople[(index + 2) % demoPeople.length]?.username ?? '')
      const postId = postIds[index]
      if (!userId || !postId) continue
      await tx.insert(postLikes).values({ postId, userId })
    }

    return {
      seeded: true,
      reason: 'inserted',
      batch: DEMO_BATCH,
      users: userIds.size,
      posts: postIds.length,
      communities: communityIds.size,
      comments: commentCount,
    }
  })
  return summary
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
  return db.transaction(async (tx) => {
    const marks = await tx.select().from(demoMarks).where(eq(demoMarks.batch, batch))
    const ids = (type: 'user' | 'post' | 'community' | 'comment') =>
      marks.filter((mark) => mark.entityType === type).map((mark) => mark.entityId)
    const commentsRemoved = await deleteMarked(tx, comments, ids('comment'))
    const postsRemoved = await deleteMarked(tx, posts, ids('post'))
    const communitiesRemoved = await deleteMarked(tx, communities, ids('community'))
    const usersRemoved = await deleteMarked(tx, users, ids('user'))
    if (marks.length > 0) {
      await tx.delete(demoMarks).where(eq(demoMarks.batch, batch))
    }
    return {
      batch,
      marks: marks.length,
      comments: commentsRemoved,
      posts: postsRemoved,
      communities: communitiesRemoved,
      users: usersRemoved,
    }
  })
}
