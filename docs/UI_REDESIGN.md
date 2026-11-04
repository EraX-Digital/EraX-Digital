# UI redesign

The visual language stays the one already shipped on https://erax-digital.vercel.app/: navy `#0b1020`, cream `#f6f3ea`, gold `#e0b15a`, teal `#8fd0c6`, Manrope for interface text, and Newsreader for headings. The wordmark remains the text “EraX” from `BrandMark`. No new logo was drawn.

The company site https://erax.digital/ is a flat black-and-white marketing page. The social app keeps the product palette and drops the large radial gradients and heavy card shadows so the signed-in screens sit closer to that restraint. A light theme inverts the same colors onto warm paper. The choice is stored in `localStorage` under `erax-theme` and applied before paint. It is not stored on the user row.

Desktop social layout: left navigation, main column, right rail. The rail holds the signed-in name, a wallet note, and the company link. Wallet pages stay two columns. Below 1100px the rail is hidden. Below 800px the side links collapse and a fixed bottom navigation remains, with 44px targets. That bar includes Home, Wallet, Explore, Communities, Messages, Alerts, and Profile.

Home can switch among Following, Discover, and Media. Feeds show a skeleton, an empty state, an error, refresh, and load-more when the API returns `nextCursor`. Like, repost, and bookmark counts change only after the server responds.

Company links to https://erax.digital/ use `target="_blank"` and `rel="noopener noreferrer"` in the social sidebar, the wallet sidebar, the public home footer, and `/about`. The About page uses the company description, principles, product names, roadmap wording, the named co-founder, the contact address, and the 2026 copyright line published on erax.digital. It does not replace the EraX Social name.
