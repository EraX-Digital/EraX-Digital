import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export type SocialLink = { label: string; url: string }

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)],
)

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio').notNull().default(''),
    website: text('website'),
    avatarStorageKey: text('avatar_storage_key'),
    coverStorageKey: text('cover_storage_key'),
    location: text('location'),
    socialLinks: jsonb('social_links').$type<SocialLink[]>().notNull().default(sql`'[]'::jsonb`),
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    creatorStatus: text('creator_status', { enum: ['none', 'creator'] })
      .notNull()
      .default('none'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('profiles_username_unique').on(sql`lower(${table.username})`)],
)

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chainFamily: text('chain_family', { enum: ['evm', 'solana'] }).notNull(),
    network: text('network').notNull(),
    address: text('address').notNull(),
    label: text('label').notNull().default(''),
    preferred: boolean('preferred').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wallets_address_exact').on(table.chainFamily, table.network, table.address),
    index('wallets_user_idx').on(table.userId),
  ],
)

export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  protocol: text('protocol', { enum: ['siwe', 'siws'] }).notNull(),
  address: text('address').notNull(),
  network: text('network').notNull(),
  domain: text('domain').notNull(),
  nonce: text('nonce').notNull().unique(),
  message: text('message').notNull().default(''),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const walletAuthEvents = pgTable('wallet_auth_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  protocol: text('protocol', { enum: ['siwe', 'siws'] }).notNull(),
  address: text('address').notNull(),
  network: text('network').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  result: text('result', { enum: ['succeeded', 'failed'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const walletPreferences = pgTable('wallet_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferredWalletId: uuid('preferred_wallet_id').references(() => wallets.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const blockchainNetworks = pgTable('blockchain_networks', {
  caip2: text('caip2').primaryKey(),
  family: text('family', { enum: ['evm', 'solana'] }).notNull(),
  name: text('name').notNull(),
  chainRef: text('chain_ref'),
  explorerTx: text('explorer_tx').notNull(),
  nativeSymbol: text('native_symbol').notNull(),
  nativeDecimals: integer('native_decimals').notNull(),
  environment: text('environment', { enum: ['mainnet', 'testnet'] }).notNull(),
})

export const blockchainAssets = pgTable(
  'blockchain_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    network: text('network')
      .notNull()
      .references(() => blockchainNetworks.caip2),
    kind: text('kind', { enum: ['native', 'erc20', 'spl', 'token2022'] }).notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    contractAddress: text('contract_address').notNull().default(''),
    decimals: integer('decimals').notNull(),
    verified: boolean('verified').notNull().default(false),
  },
  (table) => [uniqueIndex('blockchain_assets_identity').on(table.network, table.contractAddress)],
)

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'set null' }),
    network: text('network').notNull(),
    hash: text('hash').notNull(),
    logIndex: integer('log_index').notNull().default(-1),
    sender: text('sender').notNull(),
    recipient: text('recipient').notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    assetAddress: text('asset_address').notNull().default(''),
    amountBaseUnits: text('amount_base_units').notNull(),
    feeBaseUnits: text('fee_base_units'),
    status: text('status', {
      enum: ['pending', 'confirmed', 'failed', 'reverted', 'finalized', 'dropped'],
    }).notNull(),
    source: text('source', { enum: ['erax', 'chain'] }).notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wallet_transactions_identity').on(table.network, table.hash, table.logIndex),
    index('wallet_transactions_sender_idx').on(table.network, table.sender, table.createdAt),
    index('wallet_transactions_recipient_idx').on(table.network, table.recipient, table.createdAt),
  ],
)

export const transactionStatusUpdates = pgTable(
  'transaction_status_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => walletTransactions.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('transaction_status_updates_tx_idx').on(table.transactionId, table.createdAt)],
)

export const indexerCheckpoints = pgTable('indexer_checkpoints', {
  network: text('network')
    .primaryKey()
    .references(() => blockchainNetworks.caip2),
  cursor: text('cursor').notNull(),
  headHash: text('head_hash'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
)

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_logs_created_idx').on(table.createdAt)],
)

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    kind: text('kind', { enum: ['image', 'video'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('media_assets_owner_idx').on(table.ownerUserId)],
)

export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    avatarStorageKey: text('avatar_storage_key'),
    coverStorageKey: text('cover_storage_key'),
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('communities_slug_unique').on(sql`lower(${table.slug})`),
    index('communities_created_idx').on(table.createdAt),
  ],
)

export const communityMembers = pgTable(
  'community_members',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'moderator', 'member'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.communityId, table.userId] }),
    index('community_members_user_idx').on(table.userId),
  ],
)

export const communityInvites = pgTable('community_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  inviteeId: uuid('invitee_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
})

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    linkUrl: text('link_url'),
    visibility: text('visibility', { enum: ['public', 'followers', 'community'] })
      .notNull()
      .default('public'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('posts_author_created_idx').on(table.authorId, table.createdAt),
    index('posts_community_created_idx').on(table.communityId, table.createdAt),
  ],
)

export const postMedia = pgTable(
  'post_media',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.assetId] })],
)

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
)

export const postReposts = pgTable(
  'post_reposts',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
)

export const postBookmarks = pgTable(
  'post_bookmarks',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
)

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('comments_post_created_idx').on(table.postId, table.createdAt)],
)

export const commentLikes = pgTable(
  'comment_likes',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.userId] })],
)

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    index('follows_followee_idx').on(table.followeeId),
  ],
)

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index('user_blocks_blocked_idx').on(table.blockedId),
  ],
)

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  pairKey: text('pair_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_participants_user_idx').on(table.userId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('messages_conversation_created_idx').on(table.conversationId, table.createdAt)],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)],
)

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  follows: boolean('follows').notNull().default(true),
  likes: boolean('likes').notNull().default(true),
  comments: boolean('comments').notNull().default(true),
  replies: boolean('replies').notNull().default(true),
  reposts: boolean('reposts').notNull().default(true),
  messages: boolean('messages').notNull().default(true),
  communities: boolean('communities').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const hashtags = pgTable(
  'hashtags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tag: text('tag').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('hashtags_tag_unique').on(sql`lower(${table.tag})`)],
)

export const postHashtags = pgTable(
  'post_hashtags',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    hashtagId: uuid('hashtag_id')
      .notNull()
      .references(() => hashtags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.hashtagId] }),
    index('post_hashtags_tag_idx').on(table.hashtagId),
  ],
)

export const userMentions = pgTable(
  'user_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_mentions_user_idx').on(table.mentionedUserId)],
)

export const schema = {
  users,
  profiles,
  wallets,
  authChallenges,
  walletAuthEvents,
  walletPreferences,
  blockchainNetworks,
  blockchainAssets,
  walletTransactions,
  transactionStatusUpdates,
  indexerCheckpoints,
  sessions,
  emailVerificationTokens,
  passwordResetTokens,
  auditLogs,
  mediaAssets,
  communities,
  communityMembers,
  communityInvites,
  posts,
  postMedia,
  postLikes,
  postReposts,
  postBookmarks,
  comments,
  commentLikes,
  follows,
  userBlocks,
  conversations,
  conversationParticipants,
  messages,
  notifications,
  notificationPreferences,
  hashtags,
  postHashtags,
  userMentions,
}
