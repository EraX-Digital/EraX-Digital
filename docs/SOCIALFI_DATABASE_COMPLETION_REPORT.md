# EraX Social — database population completion report

Date: 2026-11-04.

## Where the rows were written

The local environment uses PGlite at `./var/pglite`. The seed wrote that database. A count query after insert, and again on the second run, returned the same totals. The second run reported `seeded: false` and `reason: already-present`.

The Neon database behind the Vercel deployment was not opened and was not modified. The production command was not executed.

The running API had the PGlite file open from before the insert, so it kept serving the earlier posts until it was restarted. After restart, `GET /api/v1/feeds/discover?limit=20` returned demo authors mixed with the existing `erax_admin` posts, and the next page cursor was present.

## Confirmed counts

| Record | Count |
| --- | ---: |
| Demo profiles | 25 |
| Posts | 120 |
| Comments | 300 |
| Likes | 200 |
| Reposts | 80 |
| Bookmarks | 40 |
| Follows | 60 |
| Communities | 10 |
| Memberships | 30 |
| Hashtags | 17 |
| Polls | 10 |
| Poll votes | 30 |
| Quote posts | 6 |
| Link posts | 10 |

The existing `erax_admin` account and its posts were still in the discover feed after the seed.

## Tests

- `packages/database/src/socialfi-demo.test.ts`: 3 passed. The in-memory run inserted the batch, rejected a second insert, and cleanup left a non-demo user and that user’s post in place. Like totals on liked posts were not all equal.
- `services/api/test/demo-feed.test.ts`: 1 passed. Discover returned 20 database posts, the next page did not repeat those ids, a post had comments, and a poll returned options with votes.
- `pnpm --filter @erax/database exec tsc --noEmit` exited 0 after the comment-frame type fix.
- ESLint was run on the seed and the new feed test.

The web package was not changed, so its production build was not run again.

## Interface check

Signed in as the existing local admin, the Following tab still shows that account’s own posts. Discover shows the fixture authors, hashtags, community names, link cards, comment counts, and Load more. The right rail lists hashtag counts from the stored posts, including `#creators` at 13 and `#solana` at 12.

## Remaining limits

- Avatars, covers, and image or video files were not inserted. Storage keys would point at missing files.
- There is still no `post_type` column and no `communities.category` column. Category text is in the community description.
- Likes are the only reaction type.
- A person who follows nobody will not see these posts on Following. They are on Discover.
- Expanding the dataset or seeding production still waits for approval.
