import { polls } from '@erax/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSocialDemo } from '../../../packages/database/src/socialfi-demo'
import { createTestApp } from './app'

let context: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  context = await createTestApp()
  const seeded = await seedSocialDemo(context.db)
  expect(seeded.seeded).toBe(true)
  expect(seeded.posts).toBe(120)
}, 120000)

afterAll(async () => {
  await context.app.close()
})

describe('demo feed reads the database', () => {
  it('pages public posts and returns the comments and poll stored for a post', async () => {
    const first = await context.app.inject({ method: 'GET', url: '/api/v1/feeds/discover?limit=20' })
    expect(first.statusCode).toBe(200)
    const page = first.json() as {
      items: Array<{ id: string; body: string; author: { username: string; displayName: string } }>
      nextCursor: string | null
    }
    expect(page.items).toHaveLength(20)
    expect(page.nextCursor).toBeTruthy()
    expect(page.items.every((item) => item.author.username && item.author.displayName && item.body.length > 0)).toBe(true)

    const second = await context.app.inject({
      method: 'GET',
      url: `/api/v1/feeds/discover?limit=20&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
    })
    expect(second.statusCode).toBe(200)
    const nextIds = new Set((second.json() as { items: Array<{ id: string }> }).items.map((item) => item.id))
    expect(page.items.some((item) => nextIds.has(item.id))).toBe(false)

    const sample = page.items[0]
    if (!sample) throw new Error('discover page was empty')
    const comments = await context.app.inject({ method: 'GET', url: `/api/v1/posts/${sample.id}/comments` })
    expect(comments.statusCode).toBe(200)
    expect((comments.json() as { items: unknown[] }).items.length).toBeGreaterThan(0)

    const poll = await context.db.select().from(polls).limit(1)
    const pollId = poll[0]?.postId
    if (!pollId) throw new Error('seeded poll missing')
    const pollPage = await context.app.inject({ method: 'GET', url: `/api/v1/posts/${pollId}/poll` })
    expect(pollPage.statusCode).toBe(200)
    const body = pollPage.json() as { options: Array<{ votes: number }> }
    expect(body.options.length).toBeGreaterThan(1)
    expect(body.options.reduce((sum, option) => sum + option.votes, 0)).toBeGreaterThan(0)
  })
})
