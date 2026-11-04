import type { AccountService } from './accounts'
import { ApiError } from './errors'
import { sniffMedia } from './media-bytes'
import type { SocialService } from './social'
import type { createProductService } from './product'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

const uuid = z.string().uuid()

const postBody = z.object({
  body: z.string().max(2000).optional(),
  linkUrl: z.string().max(500).nullable().optional(),
  visibility: z.enum(['public', 'followers', 'community']).optional(),
  communityId: uuid.nullable().optional(),
  mediaIds: z.array(uuid).max(4).optional(),
  quotePostId: uuid.nullable().optional(),
})

const commentBody = z.object({
  body: z.string().min(1).max(1000),
  parentId: uuid.nullable().optional(),
})

const communityBody = z.object({
  name: z.string().min(3).max(60),
  description: z.string().max(500).optional(),
  rules: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  slug: z.string().min(3).max(40).optional(),
})

const reportBody = z.object({
  targetType: z.enum(['post', 'comment', 'profile', 'community']),
  targetId: z.string().min(3).max(80),
  reason: z.string().min(3).max(500),
})

const usernameBody = z.object({ username: z.string().min(3).max(20) })
const messageBody = z.object({ body: z.string().min(1).max(2000) })
const roleBody = z.object({
  username: z.string().min(3).max(20),
  role: z.enum(['moderator', 'member']),
})
const prefsBody = z.object({
  follows: z.boolean().optional(),
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  replies: z.boolean().optional(),
  reposts: z.boolean().optional(),
  messages: z.boolean().optional(),
  communities: z.boolean().optional(),
})

type Deps = {
  social: SocialService
  product: ReturnType<typeof createProductService>
  accounts: AccountService
  requireSession: (request: FastifyRequest, csrf: boolean) => ReturnType<AccountService['sessionFromToken']>
  parse: <T>(schema: z.ZodType<T>, value: unknown) => T
  writeMax: number
}

function queryOf(request: FastifyRequest): Record<string, string | undefined> {
  return (request.query ?? {}) as Record<string, string | undefined>
}

function paramsOf(request: FastifyRequest): Record<string, string> {
  return request.params as Record<string, string>
}

async function readFile(request: FastifyRequest) {
  const file = await request.file()
  if (!file) throw new ApiError(400, 'invalid_input', 'Choose a file')
  const bytes = await file.toBuffer()
  if (bytes.length === 0) throw new ApiError(400, 'invalid_media', 'File is empty')
  return bytes
}

export function registerSocialRoutes(app: FastifyInstance, deps: Deps) {
  const limit = { config: { rateLimit: { max: deps.writeMax, timeWindow: '1 minute' } } }
  const { social, product, accounts, parse } = deps

  async function viewer(request: FastifyRequest, csrf: boolean) {
    const session = await deps.requireSession(request, csrf)
    return session.user.id
  }

  async function optionalViewer(request: FastifyRequest): Promise<string | null> {
    if (!request.cookies.erax_session) return null
    try {
      return await viewer(request, false)
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 403) throw error
      return null
    }
  }

  app.get('/api/v1/profiles/:username', async (request) =>
    social.getProfile(await optionalViewer(request), paramsOf(request).username ?? ''),
  )
  app.get('/api/v1/profiles/:username/posts', async (request) => {
    const query = queryOf(request)
    return social.feed(await optionalViewer(request), 'profile', paramsOf(request).username, query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/followers', async (request) => {
    const query = queryOf(request)
    return social.listFollows(await optionalViewer(request), paramsOf(request).username ?? '', 'followers', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/following', async (request) => {
    const query = queryOf(request)
    return social.listFollows(await optionalViewer(request), paramsOf(request).username ?? '', 'following', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/replies', async (request) => {
    const query = queryOf(request)
    return social.listReplies(await optionalViewer(request), paramsOf(request).username ?? '', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/media', async (request) => {
    const query = queryOf(request)
    return social.feed(await optionalViewer(request), 'profile-media', paramsOf(request).username, query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/likes', async (request) => {
    const query = queryOf(request)
    return social.listLikedPosts(await optionalViewer(request), paramsOf(request).username ?? '', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/communities', async (request) => {
    const query = queryOf(request)
    return social.listProfileCommunities(await optionalViewer(request), paramsOf(request).username ?? '', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/activity', async (request) => {
    const query = queryOf(request)
    return social.listActivity(await optionalViewer(request), paramsOf(request).username ?? '', query.cursor, query.limit)
  })
  app.get('/api/v1/profiles/:username/mutuals', async (request) => {
    const query = queryOf(request)
    return social.listMutuals(await optionalViewer(request), paramsOf(request).username ?? '', query.cursor, query.limit)
  })
  app.get('/api/v1/socialfi/chain-status', async () => social.chainStatus())
  app.post('/api/v1/reports', limit, async (request) =>
    social.reportContent(await viewer(request, true), parse(reportBody, request.body)),
  )

  app.post('/api/v1/follows', limit, async (request) => {
    const userId = await viewer(request, true)
    return social.follow(userId, parse(usernameBody, request.body).username)
  })
  app.delete('/api/v1/follows/:username', limit, async (request) =>
    social.unfollow(await viewer(request, true), paramsOf(request).username ?? ''),
  )
  app.post('/api/v1/blocks', limit, async (request) =>
    social.block(await viewer(request, true), parse(usernameBody, request.body).username),
  )
  app.delete('/api/v1/blocks/:username', limit, async (request) =>
    social.unblock(await viewer(request, true), paramsOf(request).username ?? ''),
  )
  app.get('/api/v1/blocks', async (request) => social.listBlocks(await viewer(request, false)))

  app.post('/api/v1/media', limit, async (request) => social.uploadMedia(await viewer(request, true), await readFile(request)))

  app.post('/api/v1/posts', limit, async (request) => social.createPost(await viewer(request, true), parse(postBody, request.body)))
  app.get('/api/v1/posts/:id', async (request) => social.getPost(await optionalViewer(request), paramsOf(request).id ?? ''))
  app.patch('/api/v1/posts/:id', limit, async (request) =>
    social.updatePost(await viewer(request, true), paramsOf(request).id ?? '', parse(postBody.pick({ body: true, linkUrl: true }), request.body)),
  )
  app.delete('/api/v1/posts/:id', limit, async (request, reply: FastifyReply) => {
    await social.deletePost(await viewer(request, true), paramsOf(request).id ?? '')
    return reply.status(204).send()
  })
  app.post('/api/v1/posts/:id/like', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'like', true))
  app.delete('/api/v1/posts/:id/like', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'like', false))
  app.post('/api/v1/posts/:id/repost', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'repost', true))
  app.delete('/api/v1/posts/:id/repost', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'repost', false))
  app.post('/api/v1/posts/:id/bookmark', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'bookmark', true))
  app.delete('/api/v1/posts/:id/bookmark', limit, async (request) => social.setReaction(await viewer(request, true), paramsOf(request).id ?? '', 'bookmark', false))
  app.get('/api/v1/bookmarks', async (request) => {
    const query = queryOf(request)
    return social.listBookmarks(await viewer(request, false), query.cursor, query.limit)
  })
  app.get('/api/v1/feeds/following', async (request) => {
    const query = queryOf(request)
    return social.feed(await viewer(request, false), 'following', undefined, query.cursor, query.limit)
  })
  app.get('/api/v1/feeds/discover', async (request) => {
    const query = queryOf(request)
    return social.feed(await optionalViewer(request), 'discover', undefined, query.cursor, query.limit)
  })
  app.get('/api/v1/feeds/media', async (request) => {
    const query = queryOf(request)
    return social.feed(await optionalViewer(request), 'media', undefined, query.cursor, query.limit)
  })

  app.get('/api/v1/posts/:id/comments', async (request) => {
    const query = queryOf(request)
    return social.listComments(await optionalViewer(request), paramsOf(request).id ?? '', query.cursor, query.limit)
  })
  app.post('/api/v1/posts/:id/comments', limit, async (request, reply) => {
    const comment = await social.createComment(await viewer(request, true), paramsOf(request).id ?? '', parse(commentBody, request.body))
    return reply.status(201).send(comment)
  })
  app.patch('/api/v1/comments/:id', limit, async (request) =>
    social.updateComment(await viewer(request, true), paramsOf(request).id ?? '', parse(z.object({ body: z.string().min(1).max(1000) }), request.body).body),
  )
  app.delete('/api/v1/comments/:id', limit, async (request, reply) => {
    await social.deleteComment(await viewer(request, true), paramsOf(request).id ?? '')
    return reply.status(204).send()
  })
  app.post('/api/v1/comments/:id/like', limit, async (request) => social.setCommentLike(await viewer(request, true), paramsOf(request).id ?? '', true))
  app.delete('/api/v1/comments/:id/like', limit, async (request) => social.setCommentLike(await viewer(request, true), paramsOf(request).id ?? '', false))

  app.get('/api/v1/communities', async (request) => {
    const query = queryOf(request)
    return social.listCommunities(await optionalViewer(request), query.cursor, query.q)
  })
  app.post('/api/v1/communities', limit, async (request, reply) => {
    const community = await social.createCommunity(await viewer(request, true), parse(communityBody, request.body))
    return reply.status(201).send(community)
  })
  app.get('/api/v1/communities/:slug', async (request) => social.getCommunity(await optionalViewer(request), paramsOf(request).slug ?? ''))
  app.patch('/api/v1/communities/:slug', limit, async (request) =>
    social.updateCommunity(await viewer(request, true), paramsOf(request).slug ?? '', parse(communityBody.partial(), request.body)),
  )
  app.post('/api/v1/communities/:slug/avatar', limit, async (request) =>
    social.communityImage(await viewer(request, true), paramsOf(request).slug ?? '', 'avatar', await readFile(request)),
  )
  app.post('/api/v1/communities/:slug/cover', limit, async (request) =>
    social.communityImage(await viewer(request, true), paramsOf(request).slug ?? '', 'cover', await readFile(request)),
  )
  app.get('/api/v1/communities/:slug/posts', async (request) => {
    const query = queryOf(request)
    return social.feed(await optionalViewer(request), 'community', paramsOf(request).slug, query.cursor, query.limit)
  })
  app.get('/api/v1/communities/:slug/members', async (request) => social.listMembers(await optionalViewer(request), paramsOf(request).slug ?? ''))
  app.post('/api/v1/communities/:slug/join', limit, async (request) => social.joinCommunity(await viewer(request, true), paramsOf(request).slug ?? ''))
  app.delete('/api/v1/communities/:slug/membership', limit, async (request) => social.leaveCommunity(await viewer(request, true), paramsOf(request).slug ?? ''))
  app.delete('/api/v1/communities/:slug/members/:username', limit, async (request) =>
    social.removeMember(await viewer(request, true), paramsOf(request).slug ?? '', paramsOf(request).username ?? ''),
  )
  app.post('/api/v1/communities/:slug/invites', limit, async (request) =>
    social.invite(await viewer(request, true), paramsOf(request).slug ?? '', parse(usernameBody, request.body).username),
  )
  app.post('/api/v1/community-invites/:id/accept', limit, async (request) => social.acceptInvite(await viewer(request, true), paramsOf(request).id ?? ''))
  app.post('/api/v1/communities/:slug/roles', limit, async (request) => {
    const body = parse(roleBody, request.body)
    return social.setMemberRole(await viewer(request, true), paramsOf(request).slug ?? '', body.username, body.role)
  })

  app.post('/api/v1/conversations', limit, async (request, reply) => {
    const conversation = await social.openConversation(await viewer(request, true), parse(usernameBody, request.body).username)
    return reply.status(201).send(conversation)
  })
  app.get('/api/v1/conversations', async (request) => social.listConversations(await viewer(request, false)))
  app.get('/api/v1/conversations/:id/messages', async (request) =>
    social.listMessages(await viewer(request, false), paramsOf(request).id ?? '', queryOf(request).cursor),
  )
  app.post('/api/v1/conversations/:id/messages', limit, async (request, reply) => {
    const message = await social.sendMessage(await viewer(request, true), paramsOf(request).id ?? '', parse(messageBody, request.body).body)
    return reply.status(201).send(message)
  })
  app.post('/api/v1/conversations/:id/read', limit, async (request) => social.markConversationRead(await viewer(request, true), paramsOf(request).id ?? ''))

  app.get('/api/v1/notifications', async (request) => social.listNotifications(await viewer(request, false), queryOf(request).cursor))
  app.get('/api/v1/notifications/summary', async (request) => social.notificationSummary(await viewer(request, false)))
  app.post('/api/v1/notifications/:id/read', limit, async (request) => social.markNotification(await viewer(request, true), paramsOf(request).id ?? ''))
  app.post('/api/v1/notifications/read-all', limit, async (request) => social.markAllNotifications(await viewer(request, true)))
  app.get('/api/v1/notification-preferences', async (request) => social.getPreferences(await viewer(request, false)))
  app.patch('/api/v1/notification-preferences', limit, async (request) => social.updatePreferences(await viewer(request, true), parse(prefsBody, request.body)))

  app.get('/api/v1/search', limit, async (request) => {
    const query = queryOf(request)
    return social.search(await optionalViewer(request), query.q ?? '', query.type)
  })

  app.post('/api/v1/profile/cover', limit, async (request) => {
    const userId = await viewer(request, true)
    const bytes = await readFile(request)
    const sniffed = sniffMedia(bytes)
    if (!sniffed || sniffed.kind !== 'image') {
      throw new ApiError(400, 'invalid_media', 'Cover image must be PNG, JPEG, WebP, or GIF')
    }
    return accounts.saveCover(userId, bytes, sniffed.extension, request.ip ?? null)
  })

  const rangeBody = z.enum(['7d', '30d', '90d', 'all'])
  app.get('/api/v1/studio', async (request) => {
    const range = rangeBody.safeParse(queryOf(request).range ?? '30d')
    return product.studio(await viewer(request, false), range.success ? range.data : '30d')
  })
  app.get('/api/v1/drafts', async (request) => product.listDrafts(await viewer(request, false)))
  app.post('/api/v1/drafts', limit, async (request, reply) => {
    const body = parse(z.object({ body: z.string().max(2000), linkUrl: z.string().max(500).nullable().optional() }), request.body)
    return reply.status(201).send(await product.saveDraft(await viewer(request, true), body))
  })
  app.delete('/api/v1/drafts/:id', limit, async (request) => product.deleteDraft(await viewer(request, true), paramsOf(request).id ?? ''))
  app.post('/api/v1/drafts/:id/publish', limit, async (request, reply) => {
    const userId = await viewer(request, true)
    const draft = await product.takeDraft(userId, paramsOf(request).id ?? '')
    const card = await social.createPost(userId, { body: draft.body, linkUrl: draft.linkUrl })
    return reply.status(201).send(card)
  })
  app.post('/api/v1/posts/:id/poll', limit, async (request, reply) => {
    const body = parse(
      z.object({ options: z.array(z.string().min(1).max(80)).min(2).max(6), closesAt: z.string().nullable().optional() }),
      request.body,
    )
    return reply.status(201).send(await product.attachPoll(await viewer(request, true), paramsOf(request).id ?? '', body))
  })
  app.get('/api/v1/posts/:id/poll', async (request) => product.poll(paramsOf(request).id ?? '', await optionalViewer(request)))
  app.post('/api/v1/posts/:id/poll/votes', limit, async (request) => {
    const body = parse(z.object({ optionId: uuid }), request.body)
    return product.vote(await viewer(request, true), paramsOf(request).id ?? '', body.optionId)
  })
  app.get('/api/v1/discovery', async () => product.discovery())
  app.get('/api/v1/communities/:slug/channels', async (request) => product.listChannels(paramsOf(request).slug ?? ''))
  app.post('/api/v1/communities/:slug/channels', limit, async (request, reply) => {
    const body = parse(z.object({ name: z.string().min(2).max(40), channelSlug: z.string().min(2).max(40) }), request.body)
    return reply.status(201).send(await product.createChannel(await viewer(request, true), paramsOf(request).slug ?? '', body))
  })
  app.patch('/api/v1/posts/:id/flags', limit, async (request) => {
    const body = parse(
      z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional(), featured: z.boolean().optional() }),
      request.body,
    )
    return product.setPostFlags(await viewer(request, true), paramsOf(request).id ?? '', body)
  })

  return { optionalViewer, social }
}
