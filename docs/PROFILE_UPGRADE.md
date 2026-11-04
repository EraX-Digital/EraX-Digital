# Profile upgrade

Profiles now use a header and tabs on `/app/u/[username]`.

Shown from stored fields:

- Avatar, or the first letter of the display name when no avatar is stored
- Cover image when `cover_storage_key` is set
- Display name, username, bio, location, website, social links
- Joined date from the account `created_at`
- Post, follower, and following counts
- Mutual count for a signed-in viewer: people that viewer follows who also follow this profile
- Signature-verified EVM and Solana wallets that are still connected: family, network, and a shortened address
- Self-declared creator status, labeled as not an on-chain registration

Actions: edit (self), follow and unfollow, message, block and unblock, share by copying the profile URL, and report. Reporting a profile stores a `content_reports` row. It does not hide the profile.

Tabs:

- Posts, replies, media, and communities are loaded for profiles the viewer is allowed to see
- Likes and activity are returned only to the profile owner. Another account receives 403
- Follower, following, and mutual lists are separate pages and are cursor-paginated

The editor at `/app/profile` validates username, display name, bio, website, location, visibility, creator status, and up to five social links. Username uniqueness returns 409. Profile writes and avatar uploads use the auth rate limit. Avatar and cover uploads go through the existing media storage. If the driver is `none`, the API returns 503 `media_unavailable` and the editor shows that error. Nothing is marked uploaded.

Not included: drafts, a cross-device theme on the profile row, a public likes tab, and a moderation inbox for reports.
