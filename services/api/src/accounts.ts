import { randomUUID } from 'node:crypto'
import {
  generateToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  normalizeUsername,
  tokensMatch,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '@erax/auth'
import {
  auditLogs,
  passwordResetTokens,
  profiles,
  sessions,
  users,
  emailVerificationTokens,
  type Database,
} from '@erax/database'
import type { EmailDelivery, PublicProfile, PublicUser, SocialLink } from '@erax/shared-types'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { EmailSender } from './email'
import { ApiError } from './errors'
import { storageUnavailable } from './media'
import type { MediaStorage } from './media'

const VERIFY_TTL_MS = 1000 * 60 * 60 * 24
const RESET_TTL_MS = 1000 * 60 * 60

export type AccountServiceOptions = {
  db: Database
  email: EmailSender
  media: MediaStorage
  webOrigin: string
  apiOrigin: string
  sessionTtlSeconds: number
  now(): Date
}

type Cursor = { createdAt: string; id: string }

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor
    if (!parsed.createdAt || !parsed.id) throw new Error('missing')
    return parsed
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'Cursor is invalid')
  }
}

function uniqueConstraint(error: unknown): string | null {
  const text = JSON.stringify(
    error,
    Object.getOwnPropertyNames(error instanceof Error ? error : {}),
  )
  const message = `${error instanceof Error ? error.message : ''} ${text}`
  if (message.includes('users_email_unique')) return 'email'
  if (message.includes('profiles_username_unique')) return 'username'
  if (message.includes('23505')) return 'conflict'
  return null
}

function publicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
  }
}

function avatarUrl(apiOrigin: string, key: string | null): string | null {
  if (!key) return null
  return `${apiOrigin}/api/v1/media/${key}`
}

function asLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const label = 'label' in item ? String(item.label) : ''
    const url = 'url' in item ? String(item.url) : ''
    if (!label || !url) return []
    return [{ label, url }]
  })
}

function publicProfile(
  row: typeof profiles.$inferSelect,
  apiOrigin: string,
  joinedAt: Date,
): PublicProfile {
  return {
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    website: row.website,
    avatarUrl: avatarUrl(apiOrigin, row.avatarStorageKey),
    coverUrl: avatarUrl(apiOrigin, row.coverStorageKey),
    location: row.location,
    socialLinks: asLinks(row.socialLinks),
    visibility: row.visibility,
    creatorStatus: row.creatorStatus,
    joinedAt: joinedAt.toISOString(),
  }
}

function normalizeWebsite(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new ApiError(400, 'invalid_website', 'Website must be an http or https URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'invalid_website', 'Website must be an http or https URL')
  }
  if (url.toString().length > 300) {
    throw new ApiError(400, 'invalid_website', 'Website is too long')
  }
  return url.toString()
}

function cleanLinks(links: SocialLink[]): SocialLink[] {
  if (links.length > 5) throw new ApiError(400, 'invalid_links', 'Add at most 5 social links')
  return links.map((link) => {
    const label = link.label.trim()
    if (label.length < 1 || label.length > 30) {
      throw new ApiError(400, 'invalid_links', 'Link labels must be 1-30 characters')
    }
    const url = normalizeWebsite(link.url)
    if (!url) throw new ApiError(400, 'invalid_links', 'Each link needs an http or https URL')
    return { label, url }
  })
}

export function createAccountService(options: AccountServiceOptions) {
  const { db, email, media, webOrigin, apiOrigin } = options

  async function writeAudit(
    tx: Pick<Database, 'insert'>,
    entry: {
      actorUserId?: string | null
      action: string
      targetType?: string
      targetId?: string
      metadata?: Record<string, unknown>
      ip?: string | null
    },
  ) {
    await tx.insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
    })
  }

  async function issueVerification(userId: string, address: string, ip: string | null) {
    const raw = generateToken()
    const expiresAt = new Date(options.now().getTime() + VERIFY_TTL_MS)
    await db.transaction(async (tx) => {
      await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: options.now() })
        .where(
          and(
            eq(emailVerificationTokens.userId, userId),
            isNull(emailVerificationTokens.consumedAt),
          ),
        )
      await tx.insert(emailVerificationTokens).values({
        userId,
        tokenHash: hashToken(raw),
        expiresAt,
      })
      await writeAudit(tx, {
        actorUserId: userId,
        action: 'user.verification_requested',
        targetType: 'user',
        targetId: userId,
        ip,
      })
    })
    const delivery = await email.send({
      to: address,
      purpose: 'verify-email',
      subject: 'Verify your EraX account',
      text: `Open this link to verify your EraX account:\n${webOrigin}/verify-email?token=${raw}\n\nThe link expires in 24 hours.`,
    })
    return delivery
  }

  return {
    async register(input: {
      email: string
      password: string
      username: string
      displayName?: string | undefined
      ip: string | null
    }): Promise<{ user: PublicUser; emailDelivery: EmailDelivery }> {
      const emailAddress = normalizeEmail(input.email)
      const username = normalizeUsername(input.username)
      const passwordError = validatePassword(input.password, emailAddress)
      if (passwordError) throw new ApiError(400, 'invalid_password', passwordError)
      const usernameError = validateUsername(username)
      if (usernameError) throw new ApiError(400, 'invalid_username', usernameError)
      const displayName = (input.displayName?.trim() || username).slice(0, 50)
      if (displayName.length === 0) {
        throw new ApiError(400, 'invalid_display_name', 'Display name is required')
      }
      const passwordHash = await hashPassword(input.password)
      let created: typeof users.$inferSelect
      try {
        created = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(users)
            .values({ email: emailAddress, passwordHash, role: 'user', status: 'active' })
            .returning()
          const user = inserted[0]
          if (!user) throw new Error('User insert returned no row')
          await tx.insert(profiles).values({
            userId: user.id,
            username,
            displayName,
          })
          await writeAudit(tx, {
            actorUserId: user.id,
            action: 'user.registered',
            targetType: 'user',
            targetId: user.id,
            ip: input.ip,
          })
          return user
        })
      } catch (error) {
        const conflict = uniqueConstraint(error)
        if (conflict === 'email')
          throw new ApiError(409, 'email_taken', 'An account with that email already exists')
        if (conflict === 'username')
          throw new ApiError(409, 'username_taken', 'That username is already taken')
        throw error
      }
      if (!created.email) throw new ApiError(500, 'internal_error', 'Account email was not saved')
      const emailDelivery = await issueVerification(created.id, created.email, input.ip)
      return { user: publicUser(created), emailDelivery }
    },

    async resendVerification(emailAddress: string, ip: string | null): Promise<void> {
      const normalized = normalizeEmail(emailAddress)
      const found = await db.select().from(users).where(eq(users.email, normalized)).limit(1)
      const user = found[0]
      if (!user || !user.email || user.emailVerifiedAt || user.status !== 'active') return
      await issueVerification(user.id, user.email, ip)
    },

    async verifyEmail(token: string, ip: string | null): Promise<PublicUser> {
      const tokenHash = hashToken(token)
      const found = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.tokenHash, tokenHash))
        .limit(1)
      const row = found[0]
      if (!row || row.consumedAt || row.expiresAt <= options.now()) {
        throw new ApiError(400, 'invalid_token', 'This verification link is invalid or expired')
      }
      const updated = await db.transaction(async (tx) => {
        await tx
          .update(emailVerificationTokens)
          .set({ consumedAt: options.now() })
          .where(eq(emailVerificationTokens.id, row.id))
        const usersUpdated = await tx
          .update(users)
          .set({ emailVerifiedAt: options.now(), updatedAt: options.now() })
          .where(eq(users.id, row.userId))
          .returning()
        const user = usersUpdated[0]
        if (!user)
          throw new ApiError(400, 'invalid_token', 'This verification link is invalid or expired')
        await writeAudit(tx, {
          actorUserId: user.id,
          action: 'user.email_verified',
          targetType: 'user',
          targetId: user.id,
          ip,
        })
        return user
      })
      return publicUser(updated)
    },

    async login(input: {
      email: string
      password: string
      ip: string | null
      userAgent: string | null
    }): Promise<{ user: PublicUser; sessionToken: string; csrfToken: string }> {
      const emailAddress = normalizeEmail(input.email)
      const found = await db.select().from(users).where(eq(users.email, emailAddress)).limit(1)
      const user = found[0]
      const passwordOk =
        user?.passwordHash ? await verifyPassword(user.passwordHash, input.password) : false
      if (!user || !passwordOk) {
        throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect')
      }
      if (user.status !== 'active') {
        throw new ApiError(403, 'account_suspended', 'This account is suspended')
      }
      if (!user.emailVerifiedAt) {
        throw new ApiError(403, 'email_not_verified', 'Verify your email before signing in')
      }
      const sessionToken = generateToken()
      const csrfToken = generateToken()
      const expiresAt = new Date(options.now().getTime() + options.sessionTtlSeconds * 1000)
      await db.transaction(async (tx) => {
        await tx.insert(sessions).values({
          userId: user.id,
          tokenHash: hashToken(sessionToken),
          csrfTokenHash: hashToken(csrfToken),
          expiresAt,
          ip: input.ip,
          userAgent: input.userAgent,
        })
        await writeAudit(tx, {
          actorUserId: user.id,
          action: 'user.login',
          targetType: 'user',
          targetId: user.id,
          ip: input.ip,
        })
      })
      return { user: publicUser(user), sessionToken, csrfToken }
    },

    async openSession(userId: string, ip: string | null, userAgent: string | null) {
      const found = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      const user = found[0]
      if (!user || user.status !== 'active') {
        throw new ApiError(403, 'account_suspended', 'This account is suspended')
      }
      const sessionToken = generateToken()
      const csrfToken = generateToken()
      const expiresAt = new Date(options.now().getTime() + options.sessionTtlSeconds * 1000)
      await db.transaction(async (tx) => {
        await tx.insert(sessions).values({
          userId: user.id,
          tokenHash: hashToken(sessionToken),
          csrfTokenHash: hashToken(csrfToken),
          expiresAt,
          ip,
          userAgent,
        })
        await writeAudit(tx, {
          actorUserId: user.id,
          action: 'user.login',
          targetType: 'user',
          targetId: user.id,
          ip,
        })
      })
      return { user: publicUser(user), sessionToken, csrfToken }
    },

    async sessionFromToken(
      sessionToken: string | undefined,
      csrfHeader: string | undefined,
      requireCsrf: boolean,
    ) {
      if (!sessionToken) throw new ApiError(401, 'unauthenticated', 'Sign in required')
      const found = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, hashToken(sessionToken)))
        .limit(1)
      const row = found[0]
      if (!row || row.session.revokedAt || row.session.expiresAt <= options.now()) {
        throw new ApiError(401, 'session_expired', 'Sign in required')
      }
      if (row.user.status !== 'active') {
        throw new ApiError(403, 'account_suspended', 'This account is suspended')
      }
      if (requireCsrf) {
        if (!csrfHeader || !tokensMatch(hashToken(csrfHeader), row.session.csrfTokenHash)) {
          throw new ApiError(403, 'csrf_rejected', 'CSRF token is missing or invalid')
        }
      }
      if (options.now().getTime() - row.session.lastSeenAt.getTime() > 60_000) {
        await db
          .update(sessions)
          .set({ lastSeenAt: options.now() })
          .where(eq(sessions.id, row.session.id))
      }
      return { sessionId: row.session.id, user: row.user }
    },

    async logout(sessionId: string, userId: string, ip: string | null) {
      await db.transaction(async (tx) => {
        await tx
          .update(sessions)
          .set({ revokedAt: options.now() })
          .where(eq(sessions.id, sessionId))
        await writeAudit(tx, {
          actorUserId: userId,
          action: 'user.logout',
          targetType: 'session',
          targetId: sessionId,
          ip,
        })
      })
    },

    async currentProfile(userId: string) {
      const found = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!found[0] || !user[0]) throw new ApiError(404, 'profile_missing', 'Profile was not found')
      return {
        user: publicUser(user[0]),
        profile: publicProfile(found[0], apiOrigin, user[0].createdAt),
      }
    },

    async updateProfile(
      userId: string,
      input: {
        username?: string
        displayName?: string
        bio?: string
        website?: string | null
        location?: string | null
        socialLinks?: SocialLink[]
        visibility?: 'public' | 'private'
        creatorStatus?: 'none' | 'creator'
      },
      ip: string | null,
    ) {
      const current = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
      const account = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!current[0] || !account[0])
        throw new ApiError(404, 'profile_missing', 'Profile was not found')
      const username =
        input.username === undefined ? current[0].username : normalizeUsername(input.username)
      const usernameError = validateUsername(username)
      if (usernameError) throw new ApiError(400, 'invalid_username', usernameError)
      const displayName =
        input.displayName === undefined ? current[0].displayName : input.displayName.trim()
      if (displayName.length < 1 || displayName.length > 50) {
        throw new ApiError(400, 'invalid_display_name', 'Display name must be 1-50 characters')
      }
      const bio = input.bio === undefined ? current[0].bio : input.bio
      if (bio.length > 280)
        throw new ApiError(400, 'invalid_bio', 'Bio must be 280 characters or fewer')
      const website =
        input.website === undefined ? current[0].website : normalizeWebsite(input.website)
      const location =
        input.location === undefined
          ? current[0].location
          : input.location === null || input.location.trim() === ''
            ? null
            : input.location.trim()
      if (location && location.length > 80) {
        throw new ApiError(400, 'invalid_location', 'Location must be 80 characters or fewer')
      }
      const socialLinks =
        input.socialLinks === undefined ? asLinks(current[0].socialLinks) : cleanLinks(input.socialLinks)
      const visibility = input.visibility ?? current[0].visibility
      const creatorStatus = input.creatorStatus ?? current[0].creatorStatus
      try {
        const updated = await db.transaction(async (tx) => {
          const rows = await tx
            .update(profiles)
            .set({
              username,
              displayName,
              bio,
              website,
              location,
              socialLinks,
              visibility,
              creatorStatus,
              updatedAt: options.now(),
            })
            .where(eq(profiles.userId, userId))
            .returning()
          await writeAudit(tx, {
            actorUserId: userId,
            action: 'profile.updated',
            targetType: 'profile',
            targetId: userId,
            ip,
          })
          return rows[0]
        })
        if (!updated) throw new ApiError(404, 'profile_missing', 'Profile was not found')
        return publicProfile(updated, apiOrigin, account[0].createdAt)
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (uniqueConstraint(error) === 'username') {
          throw new ApiError(409, 'username_taken', 'That username is already taken')
        }
        throw error
      }
    },

    async saveAvatar(
      userId: string,
      bytes: Buffer,
      extension: '.png' | '.jpg' | '.webp' | '.gif',
      ip: string | null,
    ) {
      const current = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
      if (!current[0]) throw new ApiError(404, 'profile_missing', 'Profile was not found')
      const key = `avatars/${userId}/${randomUUID()}${extension}`
      try {
        await media.put(key, bytes)
      } catch (error) {
        if (storageUnavailable(error)) {
          throw new ApiError(503, 'media_unavailable', 'Image upload is not available because media storage is not configured.')
        }
        throw error
      }
      await db.transaction(async (tx) => {
        await tx
          .update(profiles)
          .set({ avatarStorageKey: key, updatedAt: options.now() })
          .where(eq(profiles.userId, userId))
        await writeAudit(tx, {
          actorUserId: userId,
          action: 'profile.avatar_updated',
          targetType: 'profile',
          targetId: userId,
          ip,
        })
      })
      if (current[0].avatarStorageKey) await media.remove(current[0].avatarStorageKey)
      return { avatarUrl: avatarUrl(apiOrigin, key) }
    },

    async saveCover(
      userId: string,
      bytes: Buffer,
      extension: '.png' | '.jpg' | '.webp' | '.gif',
      ip: string | null,
    ) {
      const current = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
      if (!current[0]) throw new ApiError(404, 'profile_missing', 'Profile was not found')
      const key = `covers/${userId}/${randomUUID()}${extension}`
      try {
        await media.put(key, bytes)
      } catch (error) {
        if (storageUnavailable(error)) {
          throw new ApiError(503, 'media_unavailable', 'Image upload is not available because media storage is not configured.')
        }
        throw error
      }
      await db.transaction(async (tx) => {
        await tx
          .update(profiles)
          .set({ coverStorageKey: key, updatedAt: options.now() })
          .where(eq(profiles.userId, userId))
        await writeAudit(tx, {
          actorUserId: userId,
          action: 'profile.cover_updated',
          targetType: 'profile',
          targetId: userId,
          ip,
        })
      })
      if (current[0].coverStorageKey) await media.remove(current[0].coverStorageKey)
      return { coverUrl: avatarUrl(apiOrigin, key) }
    },

    async requestPasswordReset(emailAddress: string, ip: string | null): Promise<void> {
      const normalized = normalizeEmail(emailAddress)
      const found = await db.select().from(users).where(eq(users.email, normalized)).limit(1)
      const user = found[0]
      if (!user || !user.email || user.status !== 'active') return
      const raw = generateToken()
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResetTokens)
          .set({ consumedAt: options.now() })
          .where(
            and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.consumedAt)),
          )
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(options.now().getTime() + RESET_TTL_MS),
        })
        await writeAudit(tx, {
          actorUserId: user.id,
          action: 'user.password_reset_requested',
          targetType: 'user',
          targetId: user.id,
          ip,
        })
      })
      await email.send({
        to: user.email,
        purpose: 'reset-password',
        subject: 'Reset your EraX password',
        text: `Open this link to choose a new password:\n${webOrigin}/reset-password?token=${raw}\n\nThe link expires in 1 hour. If you did not ask for this, you can ignore it.`,
      })
    },

    async resetPassword(token: string, password: string, ip: string | null): Promise<void> {
      const found = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
        .limit(1)
      const row = found[0]
      if (!row || row.consumedAt || row.expiresAt <= options.now()) {
        throw new ApiError(400, 'invalid_token', 'This reset link is invalid or expired')
      }
      const userRows = await db.select().from(users).where(eq(users.id, row.userId)).limit(1)
      const user = userRows[0]
      if (!user) throw new ApiError(400, 'invalid_token', 'This reset link is invalid or expired')
      const passwordError = validatePassword(password, user.email ?? '')
      if (passwordError) throw new ApiError(400, 'invalid_password', passwordError)
      const passwordHash = await hashPassword(password)
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResetTokens)
          .set({ consumedAt: options.now() })
          .where(eq(passwordResetTokens.id, row.id))
        await tx
          .update(users)
          .set({ passwordHash, updatedAt: options.now() })
          .where(eq(users.id, user.id))
        await tx
          .update(sessions)
          .set({ revokedAt: options.now() })
          .where(eq(sessions.userId, user.id))
        await writeAudit(tx, {
          actorUserId: user.id,
          action: 'user.password_reset_completed',
          targetType: 'user',
          targetId: user.id,
          ip,
        })
      })
    },

    async adminSummary() {
      const userCount = await db.select({ value: sql<number>`count(*)::int` }).from(users)
      const auditCount = await db.select({ value: sql<number>`count(*)::int` }).from(auditLogs)
      return {
        userCount: Number(userCount[0]?.value ?? 0),
        auditCount: Number(auditCount[0]?.value ?? 0),
      }
    },

    async listUsers(cursorValue: string | undefined, limit: number) {
      const cursor = cursorValue ? decodeCursor(cursorValue) : null
      const filters = cursor
        ? or(
            lt(users.createdAt, new Date(cursor.createdAt)),
            and(eq(users.createdAt, new Date(cursor.createdAt)), lt(users.id, cursor.id)),
          )
        : undefined
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          emailVerifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
          username: profiles.username,
          displayName: profiles.displayName,
        })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(filters)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const next = rows[limit]
      return {
        users: page.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          username: row.username,
          displayName: row.displayName,
        })),
        nextCursor: next
          ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id })
          : null,
      }
    },

    async setUserStatus(
      actorId: string,
      userId: string,
      status: 'active' | 'suspended',
      ip: string | null,
    ) {
      if (actorId === userId) {
        throw new ApiError(400, 'cannot_change_self', 'You cannot change your own status')
      }
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(users)
          .set({ status, updatedAt: options.now() })
          .where(eq(users.id, userId))
          .returning()
        const user = rows[0]
        if (!user) throw new ApiError(404, 'user_not_found', 'User was not found')
        if (status === 'suspended') {
          await tx
            .update(sessions)
            .set({ revokedAt: options.now() })
            .where(eq(sessions.userId, userId))
        }
        await writeAudit(tx, {
          actorUserId: actorId,
          action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
          targetType: 'user',
          targetId: userId,
          ip,
        })
        return user
      })
      return publicUser(updated)
    },

    async listAudit(cursorValue: string | undefined, limit: number) {
      const cursor = cursorValue ? decodeCursor(cursorValue) : null
      const filters = cursor
        ? or(
            lt(auditLogs.createdAt, new Date(cursor.createdAt)),
            and(eq(auditLogs.createdAt, new Date(cursor.createdAt)), lt(auditLogs.id, cursor.id)),
          )
        : undefined
      const rows = await db
        .select()
        .from(auditLogs)
        .where(filters)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const next = rows[limit]
      return {
        entries: page.map((row) => ({
          id: row.id,
          actorUserId: row.actorUserId,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: row.metadata,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: next
          ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id })
          : null,
      }
    },
  }
}

export type AccountService = ReturnType<typeof createAccountService>
