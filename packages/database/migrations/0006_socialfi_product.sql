ALTER TABLE posts ADD COLUMN channel_id uuid;
ALTER TABLE posts ADD COLUMN pinned_at timestamptz;
ALTER TABLE posts ADD COLUMN locked boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN featured boolean NOT NULL DEFAULT false;

CREATE TABLE community_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_channels_name_length CHECK (char_length(name) BETWEEN 2 AND 40),
  CONSTRAINT community_channels_slug_length CHECK (char_length(slug) BETWEEN 2 AND 40)
);

CREATE UNIQUE INDEX community_channels_slug_unique ON community_channels (community_id, lower(slug));
ALTER TABLE posts
  ADD CONSTRAINT posts_channel_fk FOREIGN KEY (channel_id) REFERENCES community_channels (id) ON DELETE SET NULL;

CREATE TABLE post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_drafts_body_length CHECK (char_length(body) <= 2000)
);

CREATE INDEX post_drafts_author_idx ON post_drafts (author_id, updated_at DESC);

CREATE TABLE polls (
  post_id uuid PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES polls (post_id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL,
  CONSTRAINT poll_options_label_length CHECK (char_length(label) BETWEEN 1 AND 80),
  CONSTRAINT poll_options_position_check CHECK (position BETWEEN 0 AND 5)
);

CREATE INDEX poll_options_post_idx ON poll_options (post_id, position);

CREATE TABLE poll_votes (
  post_id uuid NOT NULL REFERENCES polls (post_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES poll_options (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
