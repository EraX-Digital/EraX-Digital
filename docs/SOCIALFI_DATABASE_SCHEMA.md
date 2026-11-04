# EraX Social — schema used by the demo dataset

The demo seed does not add a migration. It writes the tables below.

## People

`users` holds the login row. Demo email addresses are `<username>@demo.erax.invalid`, the password hash is the shared local fixture password, and `email_verified_at` is set so the account can sign in locally.

`profiles` holds the username, display name, bio, website, location, social link, and `creator_status`. `creator` means the person toggled the existing self-declared label. It is not an on-chain verification. `avatar_storage_key` and `cover_storage_key` stay null.

`demo_marks` records each demo user with batch `socialfi-demo-2026-11`.

## Posts

`posts.author_id`, `body`, `link_url`, `quote_post_id`, `community_id`, `visibility` (`public`), `featured`, `created_at`, and `updated_at`.

A poll is `polls` plus `poll_options` and `poll_votes` for that `post_id`. The post body is the question. Ten posts have polls. Two of those close one day before the seed clock; their votes are dated three days before the seed clock.

Hashtags found in the body are inserted into `hashtags` and `post_hashtags`. `@username` mentions that match a demo profile are inserted into `user_mentions`.

## Comments

`comments.post_id`, `author_id`, `parent_id`, `body`, `created_at`. A reply points at an earlier comment on the same post. Each comment is listed in `demo_marks`.

## Reactions and saves

`post_likes`, `post_reposts`, and `post_bookmarks` use the existing primary keys, so the same person cannot like, repost, or bookmark one post twice. Reposts skip the author.

`follows` stores follower and followee. The database rejects a self-follow.

## Communities

`communities` stores name, slug, description, rules, and owner. The description starts with the fixture category because there is no category column.

`community_members` stores the role and the membership time. The seed inserts the owner plus two other demo members for each community, which is 30 memberships.

## Not written

`media_assets`, `post_media`, `wallets`, `notifications`, and `messages` are left empty for this batch. Deleting a demo user still cascades any future rows that belong to that user.
