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
  return { username, email, ...session, userId: login.json().user.id as string }
}

function auth(user: { cookie: string; csrf: string }, csrf = true) {
  return {
    origin,
    cookie: user.cookie,
    ...(csrf ? { 'x-erax-csrf': user.csrf } : {}),
  }
}

describe('social platform', () => {
  it('publishes, shares, likes, comments, follows, and bookmarks between two people', async () => {
    const ada = await account('ada')
    const grace = await account('grace')

    const denied = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { origin },
      payload: { body: 'no session' },
    })
    expect(denied.statusCode).toBe(401)

    const empty = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: '   ' },
    })
    expect(empty.statusCode).toBe(400)

    const created = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: `Hello @${grace.username} #erax <script>alert(1)</script>` },
    })
    expect(created.statusCode).toBe(200)
    const postId = created.json().id as string
    expect(created.json().body).toContain('<script>alert(1)</script>')
    expect(created.json().author.username).toBe(ada.username)
    expect(created.json()).not.toHaveProperty('email')

    const seen = await context.app.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}`,
      headers: auth(grace, false),
    })
    expect(seen.statusCode).toBe(200)
    expect(seen.json().body).toContain('Hello')

    const editedByGrace = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${postId}`,
      headers: auth(grace),
      payload: { body: 'taken over' },
    })
    expect(editedByGrace.statusCode).toBe(403)

    const liked = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: auth(grace),
    })
    expect(liked.json().counts.likes).toBe(1)
    const likedAgain = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: auth(grace),
    })
    expect(likedAgain.json().counts.likes).toBe(1)

    const comment = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      headers: auth(grace),
      payload: { body: 'Welcome to EraX Social' },
    })
    expect(comment.statusCode).toBe(201)
    const reply = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      headers: auth(ada),
      payload: { body: 'Thanks', parentId: comment.json().id },
    })
    expect(reply.statusCode).toBe(201)

    const bookmark = await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/bookmark`,
      headers: auth(grace),
    })
    expect(bookmark.json().viewer.bookmarked).toBe(true)
    const bookmarks = await context.app.inject({
      method: 'GET',
      url: '/api/v1/bookmarks',
      headers: auth(grace, false),
    })
    expect(bookmarks.json().items.map((item: { id: string }) => item.id)).toContain(postId)

    const follow = await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(grace),
      payload: { username: ada.username },
    })
    expect(follow.json().following).toBe(true)
    const self = await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(ada),
      payload: { username: ada.username },
    })
    expect(self.statusCode).toBe(400)

    const feed = await context.app.inject({
      method: 'GET',
      url: '/api/v1/feeds/following',
      headers: auth(grace, false),
    })
    expect(feed.json().items.some((item: { id: string }) => item.id === postId)).toBe(true)

    const profile = await context.app.inject({ method: 'GET', url: `/api/v1/profiles/${ada.username}` })
    expect(profile.statusCode).toBe(200)
    expect(profile.json()).not.toHaveProperty('email')
    expect(profile.json().stats.followers).toBe(1)

    const notes = await context.app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: auth(ada, false),
    })
    const types = notes.json().items.map((item: { type: string }) => item.type)
    expect(types).toContain('follow')
    expect(types).toContain('like')
    expect(types).toContain('comment')

    const found = await context.app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(ada.username)}&type=users`,
    })
    expect(found.json().users.some((user: { username: string }) => user.username === ada.username)).toBe(true)
    const injected = await context.app.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(`%' or 1=1 --`)}&type=users`,
    })
    expect(injected.statusCode).toBe(200)
    expect(injected.json().users).toEqual([])
  })

  it('hides followers-only posts, private communities, and other people messages', async () => {
    const ada = await account('mina')
    const grace = await account('noah')
    const hidden = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: 'followers only note', visibility: 'followers' },
    })
    const hiddenId = hidden.json().id as string
    const stranger = await context.app.inject({ method: 'GET', url: `/api/v1/posts/${hiddenId}` })
    expect(stranger.statusCode).toBe(404)

    const community = await context.app.inject({
      method: 'POST',
      url: '/api/v1/communities',
      headers: auth(ada),
      payload: { name: `Private ${randomUUID().slice(0, 6)}`, visibility: 'private' },
    })
    expect(community.statusCode).toBe(201)
    const slug = community.json().slug as string
    const secret = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: 'members only', communityId: community.json().id },
    })
    const secretId = secret.json().id as string
    const outside = await context.app.inject({
      method: 'GET',
      url: `/api/v1/posts/${secretId}`,
      headers: auth(grace, false),
    })
    expect(outside.statusCode).toBe(404)
    const directory = await context.app.inject({ method: 'GET', url: `/api/v1/communities/${slug}` })
    expect(directory.statusCode).toBe(404)

    const invite = await context.app.inject({
      method: 'POST',
      url: `/api/v1/communities/${slug}/invites`,
      headers: auth(ada),
      payload: { username: grace.username },
    })
    expect(invite.json().invited).toBe(true)
    const accepted = await context.app.inject({
      method: 'POST',
      url: `/api/v1/community-invites/${invite.json().id}/accept`,
      headers: auth(grace),
    })
    expect(accepted.statusCode).toBe(200)
    const inside = await context.app.inject({
      method: 'GET',
      url: `/api/v1/posts/${secretId}`,
      headers: auth(grace, false),
    })
    expect(inside.statusCode).toBe(200)
    const promoted = await context.app.inject({
      method: 'POST',
      url: `/api/v1/communities/${slug}/roles`,
      headers: auth(grace),
      payload: { username: ada.username, role: 'moderator' },
    })
    expect(promoted.statusCode).toBe(403)

    const conversation = await context.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: auth(ada),
      payload: { username: grace.username },
    })
    expect(conversation.statusCode).toBe(201)
    const conversationId = conversation.json().id as string
    const sent = await context.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: auth(ada),
      payload: { body: 'A private note' },
    })
    expect(sent.statusCode).toBe(201)
    const intruder = await account('ivy')
    const leaked = await context.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: auth(intruder, false),
    })
    expect(leaked.statusCode).toBe(404)

    const blocked = await context.app.inject({
      method: 'POST',
      url: '/api/v1/blocks',
      headers: auth(grace),
      payload: { username: ada.username },
    })
    expect(blocked.json().blocked).toBe(true)
    const afterBlock = await context.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: auth(ada),
      payload: { body: 'still there?' },
    })
    expect(afterBlock.statusCode).toBe(403)
  })

  it('rejects a file that only pretends to be an image and limits repeated writes', async () => {
    const ada = await account('media')
    const fake = await context.app.inject({
      method: 'POST',
      url: '/api/v1/media',
      headers: {
        ...auth(ada),
        'content-type': 'multipart/form-data; boundary=eraxboundary',
      },
      payload: Buffer.concat([
        Buffer.from(
          '--eraxboundary\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n',
        ),
        Buffer.from('<html><script>alert(1)</script></html>'),
        Buffer.from('\r\n--eraxboundary--\r\n'),
      ]),
    })
    expect(fake.statusCode).toBe(400)
    expect(fake.json().error.code).toBe('invalid_media')

    const limited = await createTestApp({ writeRateMax: 2 })
    let limitedStatus = 0
    try {
      const username = `rate_${randomUUID().slice(0, 8)}`
      const email = `${username}@example.com`
      await limited.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin },
        payload: { email, password, username, displayName: username },
      })
      const messages = await readOutbox(limited.outboxDir)
      const token = messages.find((item) => item.to === email)?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
      await limited.app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        headers: { origin },
        payload: { token },
      })
      const login = await limited.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin },
        payload: { email, password },
      })
      const session = sessionCookie(login.headers['set-cookie'])
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await limited.app.inject({
          method: 'POST',
          url: '/api/v1/posts',
          headers: { origin, cookie: session.cookie, 'x-erax-csrf': session.csrf },
          payload: { body: `rate ${attempt}` },
        })
        limitedStatus = response.statusCode
      }
    } finally {
      await limited.app.close()
    }
    expect(limitedStatus).toBe(429)
  })

  it('paginates public posts and keeps a quote on the new post', async () => {
    const ada = await account('page')
    const created = []
    for (let index = 0; index < 3; index += 1) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/posts',
        headers: auth(ada),
        payload: { body: `page note ${index} ${randomUUID()}` },
      })
      expect(response.statusCode).toBe(200)
      created.push(response.json().id as string)
    }
    const first = await context.app.inject({ method: 'GET', url: '/api/v1/feeds/discover?limit=1' })
    expect(first.statusCode).toBe(200)
    expect(first.json().items).toHaveLength(1)
    expect(first.json().nextCursor).toBeTruthy()
    const second = await context.app.inject({
      method: 'GET',
      url: `/api/v1/feeds/discover?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
    })
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id)

    const quote = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: 'quoting the note', quotePostId: created[0] },
    })
    expect(quote.statusCode).toBe(200)
    expect(quote.json().quote.id).toBe(created[0])
  })

  it('keeps likes private, stores a report, and counts a mutual follow once', async () => {
    const ada = await account('like')
    const grace = await account('mutu')
    const noah = await account('noam')
    const post = await context.app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: auth(ada),
      payload: { body: `visible note ${randomUUID()}` },
    })
    const postId = post.json().id as string
    await context.app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: auth(grace),
    })
    const hidden = await context.app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${grace.username}/likes`,
      headers: auth(ada, false),
    })
    expect(hidden.statusCode).toBe(403)
    const own = await context.app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${grace.username}/likes`,
      headers: auth(grace, false),
    })
    expect(own.statusCode).toBe(200)
    expect(own.json().items.some((item: { id: string }) => item.id === postId)).toBe(true)

    const report = await context.app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: auth(grace),
      payload: { targetType: 'post', targetId: postId, reason: 'This demo report should be stored.' },
    })
    expect(report.statusCode).toBe(200)
    expect(report.json().reported).toBe(true)
    const again = await context.app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: auth(grace),
      payload: { targetType: 'post', targetId: postId, reason: 'This demo report should be stored.' },
    })
    expect(again.statusCode).toBe(200)

    await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(ada),
      payload: { username: grace.username },
    })
    await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(ada),
      payload: { username: grace.username },
    })
    await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(noah),
      payload: { username: grace.username },
    })
    await context.app.inject({
      method: 'POST',
      url: '/api/v1/follows',
      headers: auth(ada),
      payload: { username: noah.username },
    })
    const profile = await context.app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${grace.username}`,
      headers: auth(ada, false),
    })
    expect(profile.json().stats.followers).toBe(2)
    expect(profile.json().viewer.mutualCount).toBe(1)
    const activity = await context.app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${grace.username}/activity`,
      headers: auth(ada, false),
    })
    expect(activity.statusCode).toBe(403)
    const chain = await context.app.inject({ method: 'GET', url: '/api/v1/socialfi/chain-status' })
    expect(chain.json().creatorRegistration).toBe('not_enabled')
    expect(chain.json().tips).toBe('not_enabled')
    expect(typeof chain.json().indexedEventCount).toBe('number')
  })
})
