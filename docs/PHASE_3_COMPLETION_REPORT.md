# EraX Digital — Phase 3 Completion Report

Date: 2026-11-03

Phase 3 turns the Phase 2 foundation into EraX Social. It is an off-chain social application. It is not a production deployment, and it does not include a token, contract, or chain indexer.

## Status

| Area | Status |
| --- | --- |
| Profiles, avatar, cover, visibility, creator flag | COMPLETED AND TESTED |
| Posts, edits, soft delete, likes, reposts, bookmarks | COMPLETED AND TESTED |
| Comments and one-level replies | COMPLETED AND TESTED |
| Following and follower lists | COMPLETED AND TESTED |
| Chronological following, discover, profile, and community feeds | COMPLETED AND TESTED |
| Communities, roles, private visibility, invites | COMPLETED AND TESTED |
| Direct messages and participant checks | COMPLETED AND TESTED |
| WebSocket delivery | NOT IMPLEMENTED |
| Notifications and preferences | COMPLETED AND TESTED |
| Search for users, posts, communities, and hashtags | COMPLETED AND TESTED |
| Blocks | COMPLETED AND TESTED |
| Media sniffing and filesystem storage | COMPLETED AND TESTED |
| S3-compatible storage | NOT IMPLEMENTED |
| Video upload and playback | IMPLEMENTED BUT NOT FULLY TESTED |
| Web and admin production builds | COMPLETED AND TESTED |
| Docker, Valkey, SMTP, PostgreSQL server | BLOCKED |
| SIWE and SIWS verification | PARTIALLY IMPLEMENTED |
| Smart contracts, token, chain deployment | NOT IMPLEMENTED |

## Implemented features

Social networking works with the existing email account. A wallet is not required to register, edit a profile, post, follow, or message.

- Profile fields now include cover image, location, social links, public or private visibility, a self-declared creator flag, join date, and counts taken from the database. Public responses omit email. Only wallets with `verified_at` set are listed, so the list is empty until signature verification exists.
- Posts accept text, one http(s) link, up to four images, or one MP4. Hashtags and mentions are stored. Owners can edit and soft-delete. Likes, reposts, and bookmarks are unique per user.
- Feeds are ordered by time. Discover is public posts in publish order. It is not labeled trending.
- Communities have an owner, moderators, and members. Private communities and their posts return 404 to non-members. Owners and moderators can invite. The invited person accepts from notifications.
- Conversations are direct, identified by a unique pair of user ids. A third account receives 404. A block stops further messages and removes follows in both directions.
- Notifications cover follows, likes, comments, replies, reposts, mentions, messages, invites, and joins. Preferences can turn each group off. Duplicate keys do not create a second row.
- Search uses bound `LIKE` patterns. A query shaped like SQL text does not return every user.
- Uploads are checked by file signature. HTML renamed as PNG is rejected. Storage keys are generated. Bytes stay on the filesystem, not in PostgreSQL.
- The web app has the social navigation, composer, feeds, search, communities, messages, notifications, bookmarks, profile, settings, and a public post URL.

Messages refresh about every 8–10 seconds. The summary endpoint returns `realtime: false`. Nothing in the interface calls that channel encrypted.

## Source files

Database:

- `packages/database/migrations/0002_social.sql`
- `packages/database/src/schema.ts`
- `packages/database/src/cli.ts`

API:

- `services/api/src/social.ts`
- `services/api/src/social-routes.ts`
- `services/api/src/server.ts`
- `services/api/src/accounts.ts`
- `services/api/src/media.ts`
- `services/api/src/media-bytes.ts`
- `services/api/src/text.ts`
- `services/api/test/social.test.ts`

Web:

- `apps/web/app/app/layout.tsx`
- `apps/web/app/app/page.tsx`
- `apps/web/app/app/explore/page.tsx`
- `apps/web/app/app/search/page.tsx`
- `apps/web/app/app/bookmarks/page.tsx`
- `apps/web/app/app/notifications/page.tsx`
- `apps/web/app/app/messages/page.tsx`
- `apps/web/app/app/messages/[id]/page.tsx`
- `apps/web/app/app/communities/page.tsx`
- `apps/web/app/app/communities/new/page.tsx`
- `apps/web/app/app/communities/[slug]/page.tsx`
- `apps/web/app/app/communities/[slug]/manage/page.tsx`
- `apps/web/app/app/posts/[id]/page.tsx`
- `apps/web/app/app/posts/[id]/edit/page.tsx`
- `apps/web/app/app/u/[username]/page.tsx`
- `apps/web/app/app/profile/page.tsx`
- `apps/web/app/app/settings/page.tsx`
- `apps/web/app/p/[id]/page.tsx`
- `apps/web/components/feed-screen.tsx`
- `apps/web/components/post-card.tsx`
- `packages/api-client/src/index.ts`
- `packages/shared-types/src/index.ts`
- `packages/ui/src/styles.css`

## Database

Migration `0002_social` alters `profiles` and adds:

- `media_assets`
- `communities`
- `community_members`
- `community_invites`
- `posts`
- `post_media`
- `post_likes`
- `post_reposts`
- `post_bookmarks`
- `comments`
- `comment_likes`
- `follows`
- `user_blocks`
- `conversations`
- `conversation_participants`
- `messages`
- `notifications`
- `notification_preferences`
- `hashtags`
- `post_hashtags`
- `user_mentions`

Primary keys are UUIDs. Follows, likes, bookmarks, reposts, blocks, and memberships use unique keys, including a check that a user cannot follow or block themselves. Posts and comments use `deleted_at` rather than a hard delete. Phase 2 account tables were not dropped.

On this machine the migration applied to the existing PGlite database and skipped `0001_foundation`.

## API endpoints

Profiles and social graph:

- `GET /api/v1/profiles/:username`
- `GET /api/v1/profiles/:username/posts`
- `GET /api/v1/profiles/:username/followers`
- `GET /api/v1/profiles/:username/following`
- `POST /api/v1/follows`
- `DELETE /api/v1/follows/:username`
- `POST /api/v1/blocks`
- `DELETE /api/v1/blocks/:username`
- `GET /api/v1/blocks`
- `POST /api/v1/profile/cover`

Posts and feeds:

- `POST /api/v1/media`
- `POST /api/v1/posts`
- `GET /api/v1/posts/:id`
- `PATCH /api/v1/posts/:id`
- `DELETE /api/v1/posts/:id`
- `POST` and `DELETE /api/v1/posts/:id/like`
- `POST` and `DELETE /api/v1/posts/:id/repost`
- `POST` and `DELETE /api/v1/posts/:id/bookmark`
- `GET /api/v1/bookmarks`
- `GET /api/v1/feeds/following`
- `GET /api/v1/feeds/discover`
- `GET` and `POST /api/v1/posts/:id/comments`
- `PATCH` and `DELETE /api/v1/comments/:id`
- `POST` and `DELETE /api/v1/comments/:id/like`

Communities, messages, notifications, search:

- `GET` and `POST /api/v1/communities`
- `GET` and `PATCH /api/v1/communities/:slug`
- `POST /api/v1/communities/:slug/avatar`
- `POST /api/v1/communities/:slug/cover`
- `GET /api/v1/communities/:slug/posts`
- `GET /api/v1/communities/:slug/members`
- `POST /api/v1/communities/:slug/join`
- `DELETE /api/v1/communities/:slug/membership`
- `POST /api/v1/communities/:slug/invites`
- `POST /api/v1/community-invites/:id/accept`
- `POST /api/v1/communities/:slug/roles`
- `POST` and `GET /api/v1/conversations`
- `GET` and `POST /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/read`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/summary`
- `POST /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/read-all`
- `GET` and `PATCH /api/v1/notification-preferences`
- `GET /api/v1/search`

Phase 2 account, admin, health, and readiness routes are unchanged. Wallet verify routes still return 501.

## Authorization

- Mutating `/api` calls still require an allowed origin. Session mutations require the CSRF header.
- Another user editing or deleting a post or comment receives 403 when the post is visible, and 404 when it is not.
- Followers-only posts, private profiles, and private communities are hidden from people who cannot see them.
- Conversation reads and sends require membership. Blocks reject the send.
- Community name and visibility changes require the owner. Moderators can edit the description and invite.
- An owner cannot leave without a transfer, and the owner role cannot be reassigned by this API.
- Public profile payloads do not include email.
- Administrative suspension remains on the Phase 2 admin routes and writes an audit row. Community role changes and blocks also write audit rows.

## Tests and builds

```text
pnpm typecheck
exit 0

pnpm lint
exit 0

pnpm test
Test Files  10 passed | 1 skipped (11)
     Tests  24 passed | 1 skipped (25)
  Duration  38.08s
```

The skipped test is `packages/database/src/postgres-migrate.test.ts`, because `DATABASE_URL` is unset.

Social tests covered a public post seen by a second user, a failed edit by that user, a duplicate like that stays at one, comments and replies, bookmarks, follow and self-follow rejection, notification types, search, a SQL-shaped search that returns no users, a followers-only post hidden from strangers, a private community hidden until the invite is accepted, a non-owner role change rejected, a third user blocked from a conversation, a block that stops a later message, a fake PNG rejected, and a write limit of two that returns 429 on the third post.

The frontend test renders a post containing `<script>` as escaped text, checks empty-state copy, and rejects an empty composer.

Web build, Next.js 16.4.4, generated the social routes including `/app`, `/app/explore`, `/app/communities`, `/app/communities/new`, `/app/messages`, `/app/notifications`, `/app/bookmarks`, `/app/search`, `/app/profile`, `/app/settings`, dynamic profile, post, and community routes, and `/p/[id]`. Admin build generated `/`, `/login`, `/users`, and `/audit`.

Browser check against the restarted dev servers: the signed-in home page showed the social navigation and the empty following state. Publishing stored “First post from the local EraX Social home feed.” and a reload showed that post with like, repost, bookmark, comments, and share controls. The first click reported a client error because the form reset ran after the request; the post had already been saved. That reset is now taken from the form element captured before the request.

## Known issues

- Docker is not installed. Compose, PostgreSQL 16, Valkey, and Mailpit were not started.
- SMTP was not exercised.
- MP4 playback was not exercised in the browser. The upload path accepts an `ftyp` signature and rejects other bytes.
- Message refresh is polling. A socket server is not running.
- Search for posts is a bounded `LIKE` scan of public posts, not a ranked full-text index.
- The local database now contains the development admin, `phase_two`, and the home-feed post created during the browser check.

## Commands

Without Docker, which is this machine:

```powershell
node scripts/write-dev-env.mjs --lite
pnpm install
pnpm db:migrate
pnpm dev
```

Optional development administrator, from `README.md`:

```powershell
$env:DEV_ADMIN_EMAIL="admin@example.com"
$env:DEV_ADMIN_PASSWORD="replace-this-password-1"
pnpm db:seed
```

Checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Addresses:

- Web: http://127.0.0.1:3000
- Admin: http://127.0.0.1:3001
- API: http://127.0.0.1:4000
- Discover feed: http://127.0.0.1:4000/api/v1/feeds/discover

The dev servers were restarted after the social migration. Phase 4 has not been started.
