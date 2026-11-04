# EraX Social UI/UX audit

Date: 2026-11-04

This pass inspected the local frontend, https://erax-digital.vercel.app/, and https://erax.digital/. The company site is a dark Webflow marketing page for an independent Web3 company. Its public copy uses gold-on-dark contrast, a serif-like display treatment, and the products EraX Social, EraX Wallet, and EraX Creator. EraX Assets is described as not operational. Contact is contact@erax.digital. The app already used navy, gold, cream, and teal. Those tokens stayed. The type pair is Manrope and Newsreader.

## Live site versus local source

The live homepage still matches the previous public landing: “Connect. Create. Own.”, the available-now list, and the note that creator subscriptions and a full historical index are not in this build. The signed-in SocialFi shell, profile tabs, and company link exist in the local source and are not what the current production homepage shows. This pass was not deployed.

## What was already working

- Email accounts work without a wallet.
- The signed-in shell has a left nav, a center column, a right rail, and a bottom bar under 800px.
- Profiles show avatar, cover, counts, follow, message, share, and owner-only likes and activity.
- Posts escape HTML. Likes update from the server response.
- Light and dark themes persist in local storage.

## Problems

- Gold borders and boxed cards made every post look like a dashboard tile.
- The public headline scaled up to 104px.
- Navigation active state was only a color change.
- Post authors had no avatar, and the engagement row used unstyled buttons.
- The right rail repeated company copy and had no search.
- Profile counts were one run-on sentence.
- Messages, notifications, bookmarks, settings, and auth screens shared the same tokens but were not individually redesigned.
- There is no icon library in the app. Text labels stayed, instead of adding a new dependency or using emoji.

## What changed

- Feed posts are rows with a hairline separator, a 40px avatar, and a quiet engagement row. The active reaction uses the gold text color.
- The composer is its own surface, not another post card.
- Side navigation has a hit area and a filled active state.
- The right rail starts with a search form that opens `/app/search?q=`.
- Profile counts are a row. The avatar overlaps the cover.
- The public headline caps at 72px.
- Borders are neutral instead of gold. Shadows stay off.
- `prefers-reduced-motion` disables animation and transition.

## Not done in this pass

- A fabricated trending list or suggested-creator ranking. The app does not have that data.
- A new icon set.
- A separate visual rewrite of messages, notifications, settings, and auth beyond the shared tokens.
- Production deployment.

## Priority that remains

1. Deploy this shell after review.
2. Give messages and notifications the same row treatment as posts.
3. Add icons only from a library the project already chooses to depend on.
