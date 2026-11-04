# EraX Social — SocialFi upgrade audit

Date: 2026-11-04. This audit compares the repository with the live app at https://erax-digital.vercel.app/ and the company site at https://erax.digital/. It does not replace Phase 5 or Phase 6 contract work.

## What is already implemented

EraX Social is a pnpm monorepo: Next.js 16 and React 19 in `apps/web`, Fastify 5 in `services/api`, Drizzle, and PGlite for local development. Production is intended to use Neon. PostgreSQL does not need to be running for the local PGlite path.

Accounts use Argon2id password hashes and HttpOnly session cookies. Email verification is required before login. SIWE and SIWS exist. Social features do not require a wallet. The API stores public addresses only.

The schema and API already persist profiles (name, username, bio, location, website, social links, avatar key, cover key, visibility, self-declared creator status), follows, blocks, posts, comments and one-level replies, likes, reposts, bookmarks, hashtags, mentions, communities (description, cover key, membership, owner and moderator roles, invites), messages, and notifications. Feeds for following, discover, profile, and community are cursor-paginated. Media upload accepts PNG, JPEG, WebP, GIF, and one MP4, up to four images, when a storage driver is configured.

The live Vercel home page uses the existing product identity: navy background `#0b1020`, cream text `#f6f3ea`, gold links, Manrope and Newsreader, and the tagline Connect. Create. Own. The wordmark is the text “EraX”, not a separate logo file. The company site is a black-and-white marketing page for EraX Digital. It names EraX Social, EraX Wallet, EraX Creator, and EraX Assets, and it says those products are in development.

## Gaps found before this upgrade

- Profiles rendered as a stack of lines. There was no header with avatar fallback, follower and following lists, share, or tabs.
- The following feed loaded at most 80 authored posts and 80 reposts, then paginated that window.
- The composer accepted one file even though the API allows four images.
- Quotes were not a post field. Reports were not stored. Community rules were not a column.
- Likes and activity were not available as profile tabs. Mutual follows were not counted.
- The social shell was two columns. There was no light theme, no About page, and no link to https://erax.digital/.
- Cards used large shadows and page-wide radial gradients.
- Demo content did not exist. The admin seed creates one local administrator and no posts.
- On-chain creator registration and tips are not available. EVM and Solana deployment signatures in this tree are null. The creator wallet page stays inactive until program ids are set. The upgrade must not invent earnings.

## Preserved on purpose

Authentication, wallet signing, messages, notifications, search, bookmarks, communities, and the wallet pages stay. Phase 6 Solana program files, the indexer event table, and `/wallet/creator` were not rewritten. No EraX token, staking, yield, or fee schedule was added.

## Proposed changes that fit the current system

Add an additive migration for quote posts, community rules, content reports, and demo marks. Extend profile, feed, and community APIs that already have indexed tables. Redesign the social shell with the existing palette, a right-hand rail on desktop, and a persisted light or dark choice in the browser. Show signature-verified wallets from the `wallets` table. Show on-chain creator tools as not enabled, plus the real count of indexed program events. Seed fictional demo rows only through an explicit command.
