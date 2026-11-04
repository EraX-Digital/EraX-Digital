# EraX Social — product upgrade audit

Date: 2026-11-04. Source of truth is this repository on `main` plus the local working tree. The live site at https://erax-digital.vercel.app/ was compared with the public landing already in the repo. Signed-in SocialFi screens exist in this tree and are not assumed to be deployed.

Classifications:

- **Working** — stored and enforced on the server, with a screen that calls it.
- **Partial** — a real subset works, and the rest is named here.
- **UI only** — a control exists without the matching server behavior.
- **Not implemented** — no server behavior and no finished screen.
- **Needs chain infrastructure** — the product should wait for a deployed contract or indexer path.

## Already working

- Accounts, email verification, Argon2id passwords, and HttpOnly sessions.
- Profiles: cover, avatar, bio, website, location, social links, joined date, follow counts, post count, and owner-only edit.
- Profile tabs for posts, replies, media, communities, plus likes and activity for the owner.
- Follow, unfollow, block, and report storage.
- Posts: text, link, image or video when media storage is configured, quote, repost, like, bookmark, edit, and delete.
- One level of replies (a reply can answer a top-level comment).
- Communities: create, join, leave, owner / moderator / member roles, rules, cover, and a community feed.
- Conversations, message history, mark-read, and notification list.
- Search across people, posts, and communities.
- Optional Ethereum, Base, and Solana wallet linking with SIWE / SIWS. A wallet is not required to register or post.
- Local Solana creator program tests. They are not deployed.

## Partially implemented

- Feeds are Following, Discover, and Media. There is no separate For You, Latest, or Trending timeline.
- Replies nest one level. Deeper threads are rejected.
- Reports are stored. They do not hide the post and there is no moderator review inbox.
- Messages have a read mark when the client calls it. There is no realtime socket and no delivered state.
- Media upload returns unavailable when `MEDIA_DRIVER=none`.
- Community roles are owner, moderator, and member. There is no separate administrator role.
- Creator status is a self-declared profile flag. It is not a chain verification.

## UI exists, backend was missing before this pass

- Creator Studio counts, drafts, polls, community channels, pin / lock / feature, and a hashtag discovery list. This pass adds those on the server. Impressions, reach, and watch time stay unavailable.

## Not implemented

- A fourth community role named administrator.
- Realtime chat.
- Scraped or hand-written trend lists.
- Production demo seeding.

## Needs additional blockchain infrastructure

- Creator tipping. The EVM and Solana tipping programs exist in the repo and are not deployed. The wallet creator page stays in the not-enabled state until program ids are configured and a deploy is approved.
- On-chain creator verification. Do not show a verified badge from the self-declared `creator` flag.
- Indexed tip history on a profile. The indexer can store program events after a deploy; the profile does not treat a partial index as a complete earnings total.

## What this pass adds

Migration `0006_socialfi_product` adds drafts, polls, poll options, poll votes, community channels, and post pin / lock / feature columns.

Server rules:

- Drafts are readable only by their author. Publishing a draft uses the existing post creator.
- A person has one poll vote. They can change it until `closes_at`. A closed poll rejects new votes.
- Only a community owner or moderator can create a channel, pin a post, or lock a post. A locked post rejects new comments.
- Only the author can mark their post featured.
- Studio totals count stored follows, posts, likes, replies, and reposts for 7, 30, 90 days, or all time. Unmeasured metrics are listed as unavailable.
- Discovery topics count public hashtags from the last 7 days. Suggested creators are ordered by follower count.

Tipping was not wired to a live contract.
