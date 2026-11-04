ALTER TABLE communities ADD COLUMN rules text NOT NULL DEFAULT '';
ALTER TABLE communities ADD CONSTRAINT communities_rules_length CHECK (char_length(rules) <= 2000);

ALTER TABLE posts ADD COLUMN quote_post_id uuid REFERENCES posts (id) ON DELETE SET NULL;
CREATE INDEX posts_quote_idx ON posts (quote_post_id) WHERE quote_post_id IS NOT NULL;

CREATE INDEX comments_author_created_idx ON comments (author_id, created_at DESC);
CREATE INDEX post_likes_user_created_idx ON post_likes (user_id, created_at DESC);

CREATE TABLE content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_type_check CHECK (target_type IN ('post', 'comment', 'profile', 'community')),
  CONSTRAINT content_reports_reason_length CHECK (char_length(reason) BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX content_reports_once ON content_reports (reporter_id, target_type, target_id);
CREATE INDEX content_reports_created_idx ON content_reports (created_at DESC);

CREATE TABLE demo_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_marks_type_check CHECK (entity_type IN ('user', 'post', 'community', 'comment')),
  CONSTRAINT demo_marks_batch_length CHECK (char_length(batch) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX demo_marks_entity ON demo_marks (entity_type, entity_id);
CREATE INDEX demo_marks_batch_idx ON demo_marks (batch);
