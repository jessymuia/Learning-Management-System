-- ============================================================================
-- 07_courses_enrolment.sql — PHASE 1: Course structure & enrolment
-- ============================================================================

-- ── Course categories (hierarchical via ltree) ───────────────────────────────
CREATE TABLE course_categories (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES course_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  path        LTREE NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cat_tenant_path ON course_categories USING GIST (tenant_id, path);
CREATE INDEX idx_cat_parent ON course_categories (tenant_id, parent_id);
CREATE TRIGGER trg_cat_updated BEFORE UPDATE ON course_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Courses ──────────────────────────────────────────────────────────────────
CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES course_categories(id),
  shortname   TEXT NOT NULL,
  fullname    TEXT NOT NULL,
  summary     JSONB,
  format      TEXT NOT NULL DEFAULT 'topics',     -- topics|weeks|single
  status      TEXT NOT NULL DEFAULT 'draft',      -- draft|active|archived|deleted
  visible     BOOLEAN NOT NULL DEFAULT TRUE,
  start_date  TIMESTAMPTZ,
  end_date    TIMESTAMPTZ,
  enrol_cap   INT,                                -- NULL = unlimited
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,                        -- soft delete
  CONSTRAINT courses_format_chk CHECK (format IN ('topics','weeks','single')),
  CONSTRAINT courses_status_chk CHECK (status IN ('draft','active','archived','deleted')),
  CONSTRAINT courses_dates_chk  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT courses_cap_chk    CHECK (enrol_cap IS NULL OR enrol_cap >= 0),
  CONSTRAINT courses_shortname_uq UNIQUE (tenant_id, shortname)
);
CREATE INDEX idx_courses_category ON courses (tenant_id, category_id);
CREATE INDEX idx_courses_status   ON courses (tenant_id, status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Sections (topic/week containers) ─────────────────────────────────────────
CREATE TABLE course_sections (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_num  INT  NOT NULL,                     -- 0 = general/intro section
  name         TEXT,
  summary      JSONB,
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  availability JSONB,                             -- conditional-release rules
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cs_section_uq UNIQUE (tenant_id, course_id, section_num),
  CONSTRAINT cs_section_chk CHECK (section_num >= 0)
);
CREATE INDEX idx_cs_course ON course_sections (tenant_id, course_id, section_num);

-- ── Course modules (polymorphic activity placement) ──────────────────────────
CREATE TABLE course_modules (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  module_type  TEXT NOT NULL,                     -- assignment|quiz|resource|content|forum|lti|scorm
  instance_id  UUID NOT NULL,                     -- PK in the type-specific table
  sort_order   INT  NOT NULL DEFAULT 0,
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  availability JSONB,                             -- conditional release
  completion   JSONB,                             -- completion config
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cm_type_chk CHECK (module_type IN
    ('assignment','quiz','resource','content','forum','lti','scorm','choice','survey','feedback')),
  -- one placement per concrete instance
  CONSTRAINT cm_instance_uq UNIQUE (tenant_id, module_type, instance_id)
);
CREATE INDEX idx_cm_course ON course_modules (tenant_id, course_id, section_id, sort_order);
CREATE TRIGGER trg_cm_updated BEFORE UPDATE ON course_modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Enrolment methods (pluggable per course) ─────────────────────────────────
CREATE TABLE enrolment_methods (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                      -- manual|self|cohort|lti|payment|api
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT em_type_chk CHECK (type IN ('manual','self','cohort','lti','payment','api'))
);
CREATE INDEX idx_em_course ON enrolment_methods (tenant_id, course_id);

-- ── User enrolments (access grant; separate from role) ───────────────────────
CREATE TABLE user_enrolments (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  method_id   UUID NOT NULL REFERENCES enrolment_methods(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active',     -- active|suspended
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ue_status_chk CHECK (status IN ('active','suspended')),
  CONSTRAINT ue_window_chk CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at),
  -- a user is enrolled in a course once per method (re-enrol reuses the row)
  CONSTRAINT ue_uq UNIQUE (tenant_id, method_id, user_id)
);
CREATE INDEX idx_ue_user   ON user_enrolments (tenant_id, user_id, course_id);
CREATE INDEX idx_ue_course ON user_enrolments (tenant_id, course_id, status);
CREATE TRIGGER trg_ue_updated BEFORE UPDATE ON user_enrolments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Announcements (Phase 1 course communication) ─────────────────────────────
CREATE TABLE announcements (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  subject     TEXT NOT NULL,
  body        JSONB NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_course ON announcements (tenant_id, course_id, published_at DESC);
