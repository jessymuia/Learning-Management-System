-- Partials gap-fill: per-user quiz overrides + forum post ratings (spec §5.2, §3)

-- Per-user (or per-group) quiz overrides: extra time, extra attempts, different window
CREATE TABLE IF NOT EXISTS quiz_overrides (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  quiz_id UUID NOT NULL REFERENCES quizzes(id),
  user_id UUID,                          -- either user_id ...
  group_id UUID,                         -- ... or group_id (one must be set)
  open_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  time_limit_s INTEGER,
  attempts_allowed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qov_target_chk CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS qov_quiz_user_uq ON quiz_overrides(tenant_id, quiz_id, user_id) WHERE user_id IS NOT NULL;
ALTER TABLE quiz_overrides ENABLE ROW LEVEL SECURITY;

-- Forum post ratings: one rating per (post,user), drives posts.rating_sum
CREATE TABLE IF NOT EXISTS post_ratings (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES posts(id),
  user_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN -1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_rating_uq UNIQUE (tenant_id, post_id, user_id)
);
ALTER TABLE post_ratings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY qov_tenant ON quiz_overrides USING (tenant_id = app_current_tenant());
  CREATE POLICY prt_tenant ON post_ratings USING (tenant_id = app_current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
