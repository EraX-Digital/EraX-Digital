ALTER TABLE profiles
  ADD COLUMN cover_storage_key text,
  ADD COLUMN location text,
  ADD COLUMN social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN creator_status text NOT NULL DEFAULT 'none';

ALTER TABLE profiles
  ADD CONSTRAINT profiles_location_length CHECK (location IS NULL OR char_length(location) <= 80),
  ADD CONSTRAINT profiles_visibility_check CHECK (visibility IN ('public', 'private')),
  ADD CONSTRAINT profiles_creator_status_check CHECK (creator_status IN ('none', 'creator'));

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_kind_check CHECK (kind IN ('image', 'video')),
  CONSTRAINT media_assets_size_check CHECK (byte_size > 0 AND byte_size <= 20000000),
  CONSTRAINT media_assets_type_length CHECK (char_length(content_type) BETWEEN 3 AND 100)
);

CREATE INDEX media_assets_owner_idx ON media_assets (owner_user_id);

CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  avatar_storage_key text,
  cover_storage_key text,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_name_length CHECK (char_length(name) BETWEEN 3 AND 60),
  CONSTRAINT communities_slug_format CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
  CONSTRAINT communities_description_length CHECK (char_length(description) <= 500),
  CONSTRAINT communities_visibility_check CHECK (visibility IN ('public', 'private'))
);

CREATE UNIQUE INDEX communities_slug_unique ON communities (lower(slug));
CREATE INDEX communities_created_idx ON communities (created_at DESC);

CREATE TABLE community_members (
  community_id uuid NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id),
  CONSTRAINT community_members_role_check CHECK (role IN ('owner', 'moderator', 'member'))
);

CREATE INDEX community_members_user_idx ON community_members (user_id);

CREATE TABLE community_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT community_invites_not_self CHECK (inviter_id <> invitee_id)
);

CREATE UNIQUE INDEX community_invites_open_unique
  ON community_invites (community_id, invitee_id)
  WHERE accepted_at IS NULL;

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  community_id uuid REFERENCES communities (id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  link_url text,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT posts_body_length CHECK (char_length(body) <= 2000),
  CONSTRAINT posts_link_length CHECK (link_url IS NULL OR char_length(link_url) <= 500),
  CONSTRAINT posts_visibility_check CHECK (visibility IN ('public', 'followers', 'community'))
);

CREATE INDEX posts_author_created_idx ON posts (author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_community_created_idx ON posts (community_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_public_created_idx ON posts (created_at DESC) WHERE deleted_at IS NULL AND visibility = 'public';

CREATE TABLE post_media (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
  position integer NOT NULL,
  PRIMARY KEY (post_id, asset_id),
  UNIQUE (post_id, position),
  CONSTRAINT post_media_position_check CHECK (position BETWEEN 0 AND 3)
);

CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX post_likes_user_idx ON post_likes (user_id);

CREATE TABLE post_reposts (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_bookmarks (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX post_bookmarks_user_idx ON post_bookmarks (user_id, created_at DESC);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX comments_post_created_idx ON comments (post_id, created_at ASC) WHERE deleted_at IS NULL;

CREATE TABLE comment_likes (
  comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_not_self CHECK (follower_id <> followee_id)
);

CREATE INDEX follows_followee_idx ON follows (followee_id);

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at ASC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  type text NOT NULL,
  target_type text,
  target_id text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (
    type IN (
      'follow',
      'like',
      'comment',
      'reply',
      'repost',
      'message',
      'mention',
      'community_invite',
      'community_join'
    )
  )
);

CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  follows boolean NOT NULL DEFAULT true,
  likes boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  replies boolean NOT NULL DEFAULT true,
  reposts boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  communities boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hashtags_tag_format CHECK (tag ~ '^[a-z0-9_]{2,32}$')
);

CREATE UNIQUE INDEX hashtags_tag_unique ON hashtags (lower(tag));

CREATE TABLE post_hashtags (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES hashtags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX post_hashtags_tag_idx ON post_hashtags (hashtag_id);

CREATE TABLE user_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts (id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments (id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_mentions_target_check CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX user_mentions_user_idx ON user_mentions (mentioned_user_id);

CREATE TRIGGER communities_set_updated_at
BEFORE UPDATE ON communities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER notification_preferences_set_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
