import { randomUUID } from 'node:crypto'
import { readOutbox } from '../src/email'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, origin, sessionCookie } from './app'

const password = 'correct-horse-1'
let context: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  context = await createTestApp()
})

afterAll(async () => {
  await context.app.close()
})

async function account(prefix: string) {
  const username = `${prefix}_${randomUUID().slice(0, 8)}`.slice(0, 20)
  const email = `${username}@example.com`
  const created = await context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin },
    payload: { email, password, username, displayName: username },
  })
  expect(created.statusCode).toBe(201)
  const messages = await readOutbox(context.outboxDir)
  const message = messages.find((item) => item.to === email && item.purpose === 'verify-email')
  const token = message?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
  if (!token) throw new Error('missing verification token')
  await context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    headers: { origin },
    payload: { token },
  })
  const login = await context.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin },
    payload: { email, password },
  })
  const session = sessionCookie(login.headers['set-cookie'])
  return { username, ...session }
}

function auth(user: { cookie: string; csrf: string }) {
  return { origin, cookie: user.cookie, 'x-erax-csrf': user.csrf }
}

describe('social product upgrade', () => {
  it('keeps drafts private, records one changing poll vote, and counts studio activity', async () => {
    const ada = await account('ada')
    const grace = await account('grace')

    const draft = await context.app.inject({
      method: 'POST',
      url: '/api/v1/drafts',
      headers: auth(ada),
      payload: { body: 'private draft' },
    })
    expect(draft.statusCode).toBe(201)
    const hidden = await context.app.inject({
      method: 'GET',
      url: '/api/v1/drafts',
      headers: { origin, cookie: grace.cookie },
    })
    expect(hidden.json().items).toEqual([])

    const published = await context.app.inject({
      method: 'POST',
      url: `/api/v1/drafts/${draft.json().id}/publish`,
      headers: auth(ada),
    })
    expect(published.statusCode).toBe(201)
    const postId = published.json().id as string

    const poll = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/poll`,
      headers: auth(ada),
      payload: { options: ['Ship', 'Wait'] },
    })
    expect(poll.statusCode).toBe(201)
    const first = poll.json().options[0].id as string
    const second = poll.json().options[1].id as string
    const vote = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/poll/votes`,
      headers: auth(grace),
      payload: { optionId: first },
    })
    expect(vote.json().options.find((option: { id: string }) => option.id === first).votes).toBe(1)
    const changed = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/poll/votes`,
      headers: auth(grace),
      payload: { optionId: second },
    })
    const options = changed.json().options as Array<{ id: string; votes: number }>
    expect(options.find((option) => option.id === first)?.votes).toBe(0)
    expect(options.find((option) => option.id === second)?.votes).toBe(1)

    const studio = await context.app.inject({
      method: 'GET',
      url: '/api/v1/studio?range=all',
      headers: { origin, cookie: ada.cookie },
    })
    expect(studio.json().posts).toBeGreaterThanOrEqual(1)
    expect(studio.json().unavailable).toContain('impressions')
  })

  it('lets only owners and moderators add channels and locks comments', async () => {
    const owner = await account('own')
    const member = await account('mem')
    const community = await context.app.inject({
      method: 'POST',
      url: '/api/v1/communities',
      headers: auth(owner),
      payload: { name: `Public ${randomUUID().slice(0, 6)}`, visibility: 'public' },
    })
    expect(community.statusCode).toBe(201)
    const slug = community.json().slug as string
    await context.app.inject({
      method: 'POST',
      url: `/api/v1/communities/${slug}/join`,
      headers: auth(member),
    })
    const denied = await context.app.inject({
      method: 'POST',
      url: `/api/v1/communities/${slug}/channels`,
      headers: auth(member),
      payload: { name: 'General', channelSlug: 'general' },
    })
    expect(denied.statusCode).toBe(403)
    const created = await context.app.inject({
      method: 'POST',
      url: `/api/v1/communities/${slug}/channels`,
      headers: auth(owner),
      payload: { name: 'General', channelSlug: 'general' },
    })
    expect(created.statusCode).toBe(201)

    const post = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(owner),
      payload: { body: 'discussion', communityId: community.json().id },
    })
    const postId = post.json().id as string
    const locked = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${postId}/flags`,
      headers: auth(owner),
      payload: { locked: true },
    })
    expect(locked.statusCode).toBe(200)
    const comment = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      headers: auth(member),
      payload: { body: 'still open?' },
    })
    expect(comment.statusCode).toBe(403)
  })
})
