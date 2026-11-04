import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { assertDemoFixture, demoPlan, demoPosts } from '../seeds/socialfi-demo-content'
import { createDatabase, migrateDatabase } from './client'
import { postLikes, posts, profiles, users } from './schema'
import { assertDemoSeedAllowed, cleanupSocialDemo, countSocialDemo, seedSocialDemo } from './socialfi-demo'

describe('social demo seed guards', () => {
  it('refuses production unless the confirm flag is explicit', () => {
    expect(() =>
      assertDemoSeedAllowed({
        nodeEnv: 'production',
        driver: 'postgres',
        databaseUrl: 'postgres://example.neon.tech/erax',
        target: 'production',
      }),
    ).toThrow(/confirm/)
    expect(() =>
      assertDemoSeedAllowed({
        nodeEnv: 'production',
        driver: 'postgres',
        databaseUrl: 'postgres://example.neon.tech/erax',
        target: 'local',
      }),
    ).toThrow(/NODE_ENV=production/)
    expect(() =>
      assertDemoSeedAllowed({
        nodeEnv: 'development',
        driver: 'postgres',
        databaseUrl: 'postgres://example.neon.tech/erax',
        target: 'staging',
      }),
    ).toThrow(/ERAX_DEMO_SEED_STAGING/)
    expect(() =>
      assertDemoSeedAllowed({
        nodeEnv: 'development',
        driver: 'postgres',
        databaseUrl: 'postgres://127.0.0.1/erax',
        target: 'local',
      }),
    ).not.toThrow()
  })

  it('builds one hundred twenty distinct demo posts and the related plan', () => {
    assertDemoFixture()
    const plan = demoPlan()
    const bodies = demoPosts().map((post) => post.body)
    expect(bodies).toHaveLength(120)
    expect(new Set(bodies).size).toBe(120)
    expect(plan.users).toBeGreaterThanOrEqual(25)
    expect(plan.comments).toBeGreaterThanOrEqual(300)
    expect(plan.likes).toBe(200)
    expect(plan.reposts).toBe(80)
    expect(plan.bookmarks).toBe(40)
    expect(plan.follows).toBe(60)
    expect(plan.communities).toBe(10)
    expect(plan.memberships).toBe(30)
    expect(plan.polls).toBe(10)
    expect(plan.votes).toBe(30)
    expect(plan.hashtags).toBeGreaterThanOrEqual(15)
    expect(bodies.join('\n')).not.toMatch(/airdrop|token price|yield|staking/)
  })
})

describe('social demo seed data', () => {
  const runtimePromise = createDatabase({
    DATABASE_DRIVER: 'pglite',
    DATABASE_URL: 'postgres://unused',
    PGLITE_DIR: ':memory:',
    DATABASE_POOL_MAX: 1,
    DATABASE_SSL: 'disable',
  })

  afterAll(async () => {
    const runtime = await runtimePromise
    await runtime.close()
  })

  it('is idempotent, marks demo rows, and cleans only those rows', async () => {
    const runtime = await runtimePromise
    await migrateDatabase(runtime)
    const survivor = await runtime.db
      .insert(users)
      .values({
        email: 'real-person@example.com',
        passwordHash: 'not-a-login-hash-value',
        role: 'user',
        status: 'active',
        emailVerifiedAt: new Date(),
      })
      .returning()
    const survivorId = survivor[0]?.id
    if (!survivorId) throw new Error('survivor missing')
    await runtime.db.insert(profiles).values({
      userId: survivorId,
      username: 'real_person',
      displayName: 'Real Person',
    })
    await runtime.db.insert(posts).values({ authorId: survivorId, body: 'This post belongs to a real account.' })

    const first = await seedSocialDemo(runtime.db)
    expect(first.seeded).toBe(true)
    expect(first.posts).toBe(120)
    expect(first.users).toBeGreaterThanOrEqual(25)
    expect(first.comments).toBeGreaterThanOrEqual(300)
    expect(first.likes).toBe(200)
    expect(first.reposts).toBe(80)
    expect(first.bookmarks).toBe(40)
    expect(first.follows).toBe(60)
    expect(first.communities).toBe(10)
    expect(first.memberships).toBe(30)
    expect(first.polls).toBe(10)
    expect(first.votes).toBe(30)
    const counted = await countSocialDemo(runtime.db)
    expect(counted.posts).toBe(120)
    expect(counted.likes).toBe(200)
    const spread = await runtime.db
      .select({ likes: sql<number>`count(*)::int` })
      .from(postLikes)
      .groupBy(postLikes.postId)
    const likeTotals = spread.map((row) => Number(row.likes))
    expect(Math.max(...likeTotals)).toBeGreaterThan(Math.min(...likeTotals))
    const second = await seedSocialDemo(runtime.db)
    expect(second.seeded).toBe(false)
    expect(second.posts).toBe(120)

    const demoNames = await runtime.db
      .select({ username: profiles.username })
      .from(profiles)
      .where(eq(profiles.username, 'mira_ell'))
    expect(demoNames).toHaveLength(1)

    const removed = await cleanupSocialDemo(runtime.db)
    expect(removed.users).toBeGreaterThan(0)
    expect(removed.posts).toBe(120)
    const demoLeft = await runtime.db.select().from(profiles).where(eq(profiles.username, 'mira_ell'))
    expect(demoLeft).toHaveLength(0)
    const realLeft = await runtime.db.select().from(posts).where(eq(posts.authorId, survivorId))
    expect(realLeft).toHaveLength(1)
    expect(realLeft[0]?.body).toBe('This post belongs to a real account.')
    const again = await cleanupSocialDemo(runtime.db)
    expect(again.users).toBe(0)
    expect(again.posts).toBe(0)
    const stillThere = await runtime.db.select().from(users).where(eq(users.id, survivorId))
    expect(stillThere).toHaveLength(1)
  })
})
