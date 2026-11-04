# SocialFi upgrade completion report

This is an enhancement of EraX Social. It does not replace the product, invent an EraX token, or deploy anything. Phase 6 Solana program files, `packages/wallet-solana`, `services/indexer`, `docs/PHASE_6_*`, `docs/SOLANA_*`, `docs/EVM_SOLANA_PARITY.md`, and `apps/web/app/wallet/creator` were not edited by this upgrade.

Production was not deployed and was not seeded.

## Implemented

- Profile header from stored fields: avatar, cover when a URL is already stored, name, username, bio, location, website, social links, joined date, follower / following / post counts, and signature-verified linked wallets.
- Follow and unfollow, message link, share (clipboard, or the URL shown if the clipboard fails), and follower / following / mutual lists.
- Profile tabs that the schema can fill: Posts, Replies, Media, Communities, and, for the signed-in owner only, Likes and Activity.
- Profile editor with validation, uniqueness, rate limits, save and error states, and separate avatar and cover uploads. If the media driver cannot store a file, the API returns `503 media_unavailable` and the form shows that error.
- Composer for text, one link, and up to four images or one video. Hashtags and mentions render as links. Community publish, edit, delete, likes, comments, reposts, quotes, bookmarks, and share stay on the existing post APIs.
- Counts update only after the server accepts the reaction. An empty composer shows “Add text, a link, or a file before publishing.”
- Feeds: Following, Discover, and Media, plus community and profile feeds. Following is a bounded SQL page. Lists use a cursor. Screens show a skeleton, an empty state, an error, refresh, and load-more when `nextCursor` is present.
- Communities: description, cover URL when stored, membership, posts, members (up to 100), moderators, join and leave, rules, and remove-member for an owner or a moderator.
- Reports persist in `content_reports` and write an audit row. Reported content is not hidden. There is no moderation inbox.
- Block and unblock stay on the existing `user_blocks` path. The person who blocked someone can still open that profile to unblock. A person who was blocked does not see the blocker’s profile.
- SocialFi wallets are the real linked EVM and Solana addresses. `GET /api/v1/socialfi/chain-status` returns `creatorRegistration: not_enabled`, `tips: not_enabled`, and the indexed event count. The local API returned indexed count `0`. No earnings are invented.
- About page at `/about`, and company links to https://erax.digital/ with `target="_blank"` and `rel="noopener noreferrer"` in the social sidebar, the wallet sidebar, the public home, and the right rail.
- Light and dark theme in `localStorage` (`erax-theme`), applied before paint. It is not stored on the user row.
- Desktop layout: left nav, main column, right rail. Below 1100px the rail hides. Below 800px the side links hide and a bottom bar remains, including Profile.

## Schema

Migration `packages/database/migrations/0005_socialfi.sql` is additive:

- `communities.rules`
- `posts.quote_post_id`
- indexes `comments_author_created_idx` and `post_likes_user_created_idx`
- `content_reports` (unique on reporter, target type, and target id)
- `demo_marks` (unique on entity type and entity id)

No `DROP TABLE` or `TRUNCATE`.

## Demo content

The seed module inserts, in one transaction, 8 fictional users, 4 communities, 100 original posts, 20 comments, a follow ring, and 12 likes. Batch id: `socialfi-demo-2026-11`. Emails use `@demo.erax.invalid`. Bios say the profiles are fictional. Posts contain `Demo note`. There are no wallets and no chain events.

The Vitest run against in-memory PGlite confirmed the first seed stored 100 posts, the second seed inserted nothing, cleanup removed the marked demo user and those 100 posts, an unmarked user and post remained, and a second cleanup removed 0 rows. The 8 users, 4 communities, and 20 comments are inserted in that same transaction. The test asserts the post count directly.

That seed was not run against `./var/pglite`, staging, or production.

Commands:

```powershell
pnpm db:seed:socialfi
pnpm db:seed:socialfi:staging
pnpm db:seed:socialfi:production
pnpm db:seed:socialfi:cleanup
```

Local refuses `NODE_ENV=production`. Staging also needs `ERAX_DEMO_SEED_STAGING=1` and refuses PGlite and local hosts. Production refuses unless `--confirm=seed-socialfi-demo-production` is passed. Cleanup deletes only ids listed in `demo_marks` for this batch.

## Tests

```text
pnpm test
Test Files  27 passed | 1 skipped (28)
     Tests  77 passed | 1 skipped (78)
Duration    about 137s
```

The skip is `packages/database/src/postgres-migrate.test.ts`, which needs a real `DATABASE_URL`. New coverage includes profile privacy, quotes, pagination, reports, mutual count, activity privacy, chain status, seed guards, seed idempotency, demo marking, and cleanup safety. Existing tests were not weakened or deleted.

`pnpm --filter @erax/database exec tsc --noEmit` and `pnpm --filter @erax/api exec tsc --noEmit` exited 0. Lint of the changed SocialFi files exited 0.

Two UI fixes landed after that suite: post and profile timestamps use a fixed UTC string, and the mobile bar includes Profile. Those edits are presentational.

## Browser verification

Local web `http://127.0.0.1:3000` and API `http://127.0.0.1:4000`, signed in as the existing local `erax_admin` fixture.

Desktop:

- Public home shows “Connect. Create. Own.”, About, and the company link. Light theme set `data-theme="light"` and stayed set on `/about`.
- Signed-in home shows Following, Discover, and Media, the composer, and the right rail. The rail states that creator registration and tips are not enabled.
- Media with no attachments shows “No media posts”.
- Profile shows the stored name, bio, counts, joined date, wallet empty state, and the chain-status sentence with indexed events 0.
- Likes empty state says other people cannot see that list. Activity lists the owner’s post. Share falls back to showing the profile URL when the clipboard is unavailable.
- Publishing an empty composer shows the validation error. Publishing “A short note from the local Social check. #erax @erax_admin” succeeded, rendered the hashtag and mention as links, and Like moved to “Liked 1” only after the server response. Search `?q=%23erax` returned that post.
- `/app/communities` shows “No communities” and says there are no sample communities, which matches the unseeded local database.
- `GET /api/v1/socialfi/chain-status` returned both features `not_enabled` and `indexedEventCount` 0.

Mobile, layout viewport width 390:

- Side navigation is `display: none`. The right rail is hidden. The bottom bar is `display: flex` with 44px targets, including Profile.
- Profile tabs are 44px tall. Replies shows the empty state. The composer remains on the home column.

One early signed-in load showed a Next.js hydration warning on the session-checking paragraph. Later full loads of `/app` did not show that overlay. Timestamps no longer use locale formatting.

The browser check created one real local post on `erax_admin`. It is not demo-marked. Cleanup will not delete it.

## Security

Argon2id password hashing and the HttpOnly `erax_session` cookie are unchanged. Profile and post mutations stay behind the session and the CSRF header. Likes and follows stay unique. Likes and activity return 403 for anyone except the owner. Incoming blocks hide the profile. Post text is split into text nodes plus links, so markup stays escaped. Report reasons are 3–500 characters. Media and profile URL fields go through the existing validators. Write routes stay rate-limited. Private messages were not opened up.

## Not done

- Drafts.
- Nested comments beyond the existing one-level replies.
- A moderation queue. Reports are stored and do not hide content.
- Theme on the user row. It is local to the browser.
- Cover and avatar bytes when `MEDIA_DRIVER=none`. The editor reports the storage error instead of pretending the upload worked.
- Multiple videos, or more than four images.
- On-chain creator registration, SOL tips, and ETH tips. Deployments have no signature, so those sections stay not enabled.
- Member lists above 100, and a second page on some profile tabs (replies, media, likes, communities, activity load one page).
- Demo seed against the developer PGlite directory. Only the in-memory test database was seeded.
- Web `tsc` was not re-run after the final UTC timestamp and mobile Profile-link edits. The running Next dev server compiled the pages that were opened.

## Deployment

Not deployed. Not seeded in production. Live site and company site were inspected for color, type, and the company facts used on `/about`. No new logo was added.
