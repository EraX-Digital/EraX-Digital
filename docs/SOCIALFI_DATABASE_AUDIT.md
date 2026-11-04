# EraX Social — database audit for the demo dataset

Date: 2026-11-04. This audit reads the Drizzle schema and migrations `0001` through `0006`. It does not connect to the hosted Neon database and it does not print a connection string.

The configured local driver is PGlite (`./var/pglite`). That file is the development database. Production seeding is a separate, explicit command and was not run.

## Tables inspected

Accounts and sessions: `users`, `profiles`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `audit_logs`.

Social graph: `follows`, `user_blocks`, `user_mentions`, `hashtags`, `post_hashtags`.

Posts and responses: `posts`, `post_media`, `media_assets`, `post_likes`, `post_reposts`, `post_bookmarks`, `comments`, `comment_likes`.

Communities: `communities`, `community_members`, `community_invites`, `community_channels`.

Polls and drafts: `polls`, `poll_options`, `poll_votes`, `post_drafts`.

Messages and notices: `conversations`, `conversation_participants`, `messages`, `notifications`, `notification_preferences`, `content_reports`.

Demo safety: `demo_marks`.

Wallet and chain tables exist and are unused by this seed. Demo profiles do not get wallets or verified badges.

## Constraints that the seed has to respect

- Usernames match `^[a-z0-9_]{3,20}$`. Bios are at most 280 characters. Post bodies are at most 2000. Comments are 1 to 1000 characters.
- Follows cannot point at the same person (`follows_not_self`). The primary key blocks a duplicate follow.
- Likes, reposts, and bookmarks are unique on `(post_id, user_id)`.
- Poll votes are unique on `(post_id, user_id)`.
- Hashtags match `^[a-z0-9_]{2,32}$` and are unique case-insensitively.
- Community slugs match `^[a-z0-9-]{3,40}$`. Member roles are `owner`, `moderator`, or `member`.
- `demo_marks` is unique on `(entity_type, entity_id)` and only allows `user`, `post`, `community`, and `comment`.

## What already existed

The social tables, quote posts, reports, and demo marks were already migrated. Polls, drafts, channels, and pin / lock / feature columns arrived in `0006_socialfi_product`. The previous fixture inserted 8 people, 4 communities, 100 templated posts, 20 comments, a follow ring, and 12 likes.

The feed API reads `posts` with the author profile, counts likes, comments, and reposts, and loads a quoted post when `quote_post_id` is set. Hashtags and mentions are parsed from the body by the API on a normal publish. A direct insert has to write `hashtags`, `post_hashtags`, and `user_mentions` itself. Polls are loaded by the post endpoint, not embedded in the feed card.

## Missing from the schema, and left unchanged

- There is no `posts.post_type` column. A post is text, a link (`link_url`), a quote (`quote_post_id`), media (`post_media`), or a poll (`polls`). Adding a redundant type column would not change the feed.
- There is no `communities.category` column. The seed stores the category in the description (`Category: …`) so a later column is optional.
- Reactions are likes only. There is no reaction-type enum. Reposts and bookmarks are separate tables, which already matches the product.
- Posts do not have a parent post id. Replies are comments, with `comments.parent_id`. The API accepts one extra nesting level.
- Avatars and covers are storage keys. This seed does not invent keys, because a missing file would render as a broken image. The interface already falls back to initials.
- Image and video bytes are not seeded. `MEDIA_DRIVER` is not assumed to be available. Link posts use `https://example.com/erax-notes/…` and `https://erax.digital/`.

## Recommended later changes

Add a community category column only if the product starts filtering on it. Keep demo rows in `demo_marks` rather than a boolean on `users`, so cleanup can list exact ids. Do not add a generic reaction table until the interface has more than one reaction.
