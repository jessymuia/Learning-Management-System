-- ============================================================================
-- 11_engagement.sql — PHASE 3: Groups, forums, messaging, calendar, surveys
-- ============================================================================

-- ── Groups & groupings ───────────────────────────────────────────────────────
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT groups_uq UNIQUE (tenant_id, course_id, name)
);
CREATE INDEX idx_groups_course ON groups (tenant_id, course_id);

CREATE TABLE groupings (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  CONSTRAINT groupings_uq UNIQUE (tenant_id, course_id, name)
);

CREATE TABLE group_members (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',     -- member|leader
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, group_id, user_id)
);
CREATE INDEX idx_gm_user ON group_members (tenant_id, user_id);

CREATE TABLE grouping_groups (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grouping_id UUID NOT NULL REFERENCES groupings(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, grouping_id, group_id)
);

-- wire submissions.group_id now that groups exists (Phase 2 forward-declared it)
ALTER TABLE submissions
  ADD CONSTRAINT sub_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

-- ── Forums ───────────────────────────────────────────────────────────────────
CREATE TABLE forums (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  intro       JSONB,
  type        TEXT NOT NULL DEFAULT 'general',   -- general|qanda|single|news
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forum_type_chk CHECK (type IN ('general','qanda','single','news'))
);
CREATE INDEX idx_forum_course ON forums (tenant_id, course_id);

CREATE TABLE discussions (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forum_id    UUID NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  subject     TEXT NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_disc_forum ON discussions (tenant_id, forum_id, created_at DESC);

CREATE TABLE posts (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES posts(id) ON DELETE CASCADE,   -- threading
  author_id     UUID REFERENCES users(id),
  message       JSONB NOT NULL,
  rating_sum    INT NOT NULL DEFAULT 0,
  is_answer     BOOLEAN NOT NULL DEFAULT FALSE,  -- Q&A "accepted answer"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_disc ON posts (tenant_id, discussion_id, created_at);
CREATE INDEX idx_posts_parent ON posts (tenant_id, parent_id);
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE forum_subscriptions (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forum_id   UUID NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, forum_id, user_id)
);

-- ── Messaging (1:1 + group conversations) ────────────────────────────────────
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'direct',     -- direct|group
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conv_type_chk CHECK (type IN ('direct','group'))
);

CREATE TABLE conversation_members (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, conversation_id, user_id)
);
CREATE INDEX idx_cm_user_conv ON conversation_members (tenant_id, user_id);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id),
  body            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_conv ON messages (tenant_id, conversation_id, created_at);

-- ── Calendar events ──────────────────────────────────────────────────────────
CREATE TABLE calendar_events (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,                      -- site|course|user|group
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
  module_id   UUID REFERENCES course_modules(id) ON DELETE CASCADE, -- due-date sync
  name        TEXT NOT NULL,
  description JSONB,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cev_scope_chk CHECK (scope IN ('site','course','user','group')),
  CONSTRAINT cev_window_chk CHECK (end_at IS NULL OR end_at >= start_at)
);
CREATE INDEX idx_cev_course ON calendar_events (tenant_id, course_id, start_at);
CREATE INDEX idx_cev_user ON calendar_events (tenant_id, user_id, start_at);

-- ── Surveys / feedback / choice (non-graded) ─────────────────────────────────
CREATE TABLE choices (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  options     JSONB NOT NULL,                     -- [{id,text,cap}]
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  anonymous   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE choice_responses (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  choice_id   UUID NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL if anonymous
  option_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chr_choice ON choice_responses (tenant_id, choice_id);

CREATE TABLE feedback_forms (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  questions   JSONB NOT NULL,                     -- [{id,type,text,options}]
  anonymous   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback_responses (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id     UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL if anonymous
  answers     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fbr_form ON feedback_responses (tenant_id, form_id);

-- ── Conditional availability rules (reusable engine) ─────────────────────────
-- Stored as JSONB on sections/modules/program_courses; this table holds named,
-- reusable rule sets and a place for the rules engine to record evaluations.
CREATE TABLE availability_rules (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT,
  rule        JSONB NOT NULL,                     -- {op:and,rules:[{type:date,...},{type:grade,...}]}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
