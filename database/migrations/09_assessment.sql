-- ============================================================================
-- 09_assessment.sql — PHASE 2: Quiz engine, question bank, assignments
-- ============================================================================

-- ── Question bank (versioned categories) ─────────────────────────────────────
CREATE TABLE question_categories (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,   -- NULL = shared bank
  parent_id   UUID REFERENCES question_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qc_course ON question_categories (tenant_id, course_id);

CREATE TABLE questions (
  id                 UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id        UUID NOT NULL REFERENCES question_categories(id) ON DELETE CASCADE,
  qtype              TEXT NOT NULL,               -- mcq|multichoice|truefalse|matching|shortanswer|numerical|essay|...
  current_version_id UUID,                        -- FK added after question_versions exists
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT q_qtype_chk CHECK (qtype IN
    ('mcq','multichoice','truefalse','matching','shortanswer','numerical',
     'essay','selectmissing','draganddrop','cloze','calculated'))
);
CREATE INDEX idx_q_category ON questions (tenant_id, category_id);

-- Immutable once referenced by an attempt
CREATE TABLE question_versions (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version       INT  NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ready',    -- draft|ready|retired
  questiontext  JSONB NOT NULL,
  defaultmark   NUMERIC(12,5) NOT NULL DEFAULT 1,
  data          JSONB NOT NULL,                   -- answers, options, tolerances
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qv_status_chk CHECK (status IN ('draft','ready','retired')),
  CONSTRAINT qv_uq UNIQUE (tenant_id, question_id, version)
);
CREATE INDEX idx_qv_question ON question_versions (tenant_id, question_id, version DESC);
-- now wire questions.current_version_id
ALTER TABLE questions
  ADD CONSTRAINT q_current_ver_fk FOREIGN KEY (current_version_id)
  REFERENCES question_versions(id) ON DELETE SET NULL;

-- ── Quizzes ──────────────────────────────────────────────────────────────────
CREATE TABLE quizzes (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  intro            JSONB,
  open_at          TIMESTAMPTZ,
  close_at         TIMESTAMPTZ,
  time_limit_s     INT,
  attempts_allowed INT NOT NULL DEFAULT 0,        -- 0 = unlimited
  grade_method     TEXT NOT NULL DEFAULT 'highest', -- highest|average|first|last
  navigation       TEXT NOT NULL DEFAULT 'free',  -- free|sequential
  behaviour        TEXT NOT NULL DEFAULT 'deferred', -- deferred|immediate|adaptive
  shuffle          BOOLEAN NOT NULL DEFAULT TRUE,
  grace_period_s   INT NOT NULL DEFAULT 0,
  review_options   JSONB NOT NULL DEFAULT '{}',
  settings         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qz_grademethod_chk CHECK (grade_method IN ('highest','average','first','last')),
  CONSTRAINT qz_nav_chk CHECK (navigation IN ('free','sequential')),
  CONSTRAINT qz_behaviour_chk CHECK (behaviour IN ('deferred','immediate','adaptive')),
  CONSTRAINT qz_window_chk CHECK (close_at IS NULL OR open_at IS NULL OR close_at >= open_at),
  CONSTRAINT qz_timelimit_chk CHECK (time_limit_s IS NULL OR time_limit_s > 0),
  CONSTRAINT qz_attempts_chk CHECK (attempts_allowed >= 0)
);
CREATE INDEX idx_qz_course ON quizzes (tenant_id, course_id);
CREATE TRIGGER trg_qz_updated BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Quiz layout: which questions (or random slots) appear, and their marks
CREATE TABLE quiz_slots (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  slot_num      INT NOT NULL,
  question_id   UUID REFERENCES questions(id),    -- NULL = random slot
  random_category_id UUID REFERENCES question_categories(id),  -- for random draw
  maxmark       NUMERIC(12,5) NOT NULL DEFAULT 1,
  CONSTRAINT qs_uq UNIQUE (tenant_id, quiz_id, slot_num),
  CONSTRAINT qs_source_chk CHECK (
    (question_id IS NOT NULL AND random_category_id IS NULL) OR
    (question_id IS NULL AND random_category_id IS NOT NULL))
);
CREATE INDEX idx_qs_quiz ON quiz_slots (tenant_id, quiz_id, slot_num);

-- ── Quiz attempts (state machine) ────────────────────────────────────────────
CREATE TABLE quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_no  INT  NOT NULL,
  state       TEXT NOT NULL DEFAULT 'inprogress', -- inprogress|overdue|finished|abandoned
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at      TIMESTAMPTZ,                        -- server-authoritative deadline
  finished_at TIMESTAMPTZ,
  sumgrade    NUMERIC(12,5),
  needs_grading BOOLEAN NOT NULL DEFAULT FALSE,   -- has pending human-graded questions
  CONSTRAINT qa_state_chk CHECK (state IN ('inprogress','overdue','finished','abandoned')),
  CONSTRAINT qa_uq UNIQUE (tenant_id, quiz_id, user_id, attempt_no)
);
CREATE INDEX idx_qa_user ON quiz_attempts (tenant_id, user_id, quiz_id);
-- at most one live (inprogress/overdue) attempt per user per quiz
CREATE UNIQUE INDEX uq_qa_one_live ON quiz_attempts (tenant_id, quiz_id, user_id)
  WHERE state IN ('inprogress','overdue');

-- Which concrete question version was drawn into each slot for an attempt
CREATE TABLE attempt_questions (
  id                  UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_id          UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  slot_num            INT NOT NULL,
  question_version_id UUID NOT NULL REFERENCES question_versions(id),
  maxmark             NUMERIC(12,5) NOT NULL,
  CONSTRAINT aq_uq UNIQUE (tenant_id, attempt_id, slot_num)
);
CREATE INDEX idx_aq_attempt ON attempt_questions (tenant_id, attempt_id);

-- ── Attempt steps (append-only interaction log; monthly-partitioned) ─────────
CREATE TABLE attempt_steps (
  id                  UUID NOT NULL DEFAULT uuidv7(),
  tenant_id           UUID NOT NULL,
  attempt_id          UUID NOT NULL,
  question_version_id UUID NOT NULL,
  slot_num            INT NOT NULL,
  seq                 INT NOT NULL,
  action              TEXT NOT NULL,              -- autosave|submit|comment|regrade|manualgrade
  state               TEXT NOT NULL,              -- todo|complete|needsgrading|gradedright|...
  response            JSONB,
  fraction            NUMERIC(12,7),              -- 0..1 score for this state
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_as_attempt ON attempt_steps (tenant_id, attempt_id, slot_num, seq);

-- ── Assignments ──────────────────────────────────────────────────────────────
CREATE TABLE assignments (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  instructions     JSONB,
  due_at           TIMESTAMPTZ,
  cutoff_at        TIMESTAMPTZ,                   -- hard close
  max_attempts     INT NOT NULL DEFAULT 1,
  submission_types JSONB NOT NULL DEFAULT '["file"]',
  blind_marking    BOOLEAN NOT NULL DEFAULT FALSE,
  group_submission BOOLEAN NOT NULL DEFAULT FALSE,
  rubric_id        UUID REFERENCES rubrics(id),
  late_policy      JSONB NOT NULL DEFAULT '{}',
  settings         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asg_window_chk CHECK (cutoff_at IS NULL OR due_at IS NULL OR cutoff_at >= due_at),
  CONSTRAINT asg_maxatt_chk CHECK (max_attempts >= 1)
);
CREATE INDEX idx_asg_course ON assignments (tenant_id, course_id);
CREATE TRIGGER trg_asg_updated BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Submissions + marking workflow ───────────────────────────────────────────
CREATE TABLE submissions (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id  UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id       UUID,                            -- set for group submissions (FK in Phase 3)
  attempt_no     INT NOT NULL DEFAULT 1,
  state          TEXT NOT NULL DEFAULT 'draft',   -- draft|submitted|graded|returned
  text_content   JSONB,
  submitted_at   TIMESTAMPTZ,
  is_late        BOOLEAN NOT NULL DEFAULT FALSE,
  marker_id      UUID REFERENCES users(id),
  workflow_state TEXT,                            -- notmarked|inmarking|complete|released
  rubric_scores  JSONB,
  feedback       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sub_state_chk CHECK (state IN ('draft','submitted','graded','returned')),
  CONSTRAINT sub_wf_chk CHECK (workflow_state IS NULL OR workflow_state IN
    ('notmarked','inmarking','complete','released')),
  CONSTRAINT sub_uq UNIQUE (tenant_id, assignment_id, user_id, attempt_no)
);
CREATE INDEX idx_sub_assignment ON submissions (tenant_id, assignment_id, workflow_state);
CREATE INDEX idx_sub_user ON submissions (tenant_id, user_id);
CREATE TRIGGER trg_sub_updated BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Activity & course completion ─────────────────────────────────────────────
CREATE TABLE activity_completion (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id    UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state        SMALLINT NOT NULL DEFAULT 0,       -- 0 incomplete,1 complete,2 pass,3 fail
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, module_id, user_id),
  CONSTRAINT ac_state_chk CHECK (state BETWEEN 0 AND 3)
);
CREATE INDEX idx_ac_user ON activity_completion (tenant_id, user_id);

CREATE TABLE course_completion (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state        TEXT NOT NULL DEFAULT 'inprogress', -- inprogress|complete
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, course_id, user_id),
  CONSTRAINT cc_state_chk CHECK (state IN ('inprogress','complete'))
);
CREATE INDEX idx_cc_user ON course_completion (tenant_id, user_id);
