-- ============================================================================
-- 12_credentials_programs.sql — PHASE 3: Badges/certificates + Programs
-- ============================================================================

-- ── Credentials (badge/certificate templates + issued instances) ─────────────
CREATE TABLE credential_definitions (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                      -- badge|certificate
  name        TEXT NOT NULL,
  source_type TEXT NOT NULL,                      -- course|program|criteria
  source_id   UUID,                               -- course_id or program_id
  template    JSONB NOT NULL DEFAULT '{}',        -- Open Badges metadata / PDF template
  criteria    JSONB NOT NULL DEFAULT '{}',        -- issuance criteria
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cd_type_chk CHECK (type IN ('badge','certificate')),
  CONSTRAINT cd_source_chk CHECK (source_type IN ('course','program','criteria'))
);
CREATE INDEX idx_cd_source ON credential_definitions (tenant_id, source_type, source_id);

CREATE TABLE user_credentials (
  id                UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id     UUID NOT NULL REFERENCES credential_definitions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_code TEXT NOT NULL UNIQUE,         -- public shareable handle
  evidence          JSONB,
  revoked_at        TIMESTAMPTZ,
  CONSTRAINT uc_uq UNIQUE (tenant_id, definition_id, user_id)
);
CREATE INDEX idx_uc_user ON user_credentials (tenant_id, user_id);

-- ── Programs (packaged paths / nanodegrees) ──────────────────────────────────
CREATE TABLE programs (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug          CITEXT NOT NULL,
  title         TEXT NOT NULL,
  description   JSONB,
  status        TEXT NOT NULL DEFAULT 'draft',    -- draft|active|archived
  min_electives INT  NOT NULL DEFAULT 0,
  credential_def_id UUID REFERENCES credential_definitions(id),  -- issued on completion
  pricing       JSONB NOT NULL DEFAULT '{}',
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prog_status_chk CHECK (status IN ('draft','active','archived')),
  CONSTRAINT prog_minelec_chk CHECK (min_electives >= 0),
  CONSTRAINT prog_slug_uq UNIQUE (tenant_id, slug)
);
CREATE TRIGGER trg_prog_updated BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cohorts (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id  UUID REFERENCES programs(id) ON DELETE CASCADE,  -- NULL = course-level cohort
  name        TEXT NOT NULL,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coh_window_chk CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);
CREATE INDEX idx_coh_program ON cohorts (tenant_id, program_id);

CREATE TABLE program_courses (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id     UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  requirement    TEXT NOT NULL DEFAULT 'required', -- required|elective
  elective_group TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  unlock_rule    JSONB,
  CONSTRAINT pc_req_chk CHECK (requirement IN ('required','elective')),
  CONSTRAINT pc_elective_grp_chk CHECK (requirement <> 'elective' OR elective_group IS NOT NULL),
  CONSTRAINT pc_uq UNIQUE (tenant_id, program_id, course_id)
);
CREATE INDEX idx_pc_program ON program_courses (tenant_id, program_id, sort_order);
CREATE INDEX idx_pc_course  ON program_courses (tenant_id, course_id);  -- "which programs is this course in"

CREATE TABLE program_enrolments (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active',     -- active|suspended|completed|withdrawn
  cohort_id    UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT pe_status_chk CHECK (status IN ('active','suspended','completed','withdrawn')),
  CONSTRAINT pe_uq UNIQUE (tenant_id, program_id, user_id)
);
CREATE INDEX idx_pe_user ON program_enrolments (tenant_id, user_id, program_id);

CREATE TABLE program_progress (
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  program_id          UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  required_total      INT NOT NULL DEFAULT 0,
  required_completed  INT NOT NULL DEFAULT 0,
  electives_completed INT NOT NULL DEFAULT 0,
  percent             NUMERIC(5,2) NOT NULL DEFAULT 0,
  state               TEXT NOT NULL DEFAULT 'inprogress', -- inprogress|completed
  credential_issued_at TIMESTAMPTZ,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, program_id, user_id),
  CONSTRAINT pp_state_chk CHECK (state IN ('inprogress','completed')),
  CONSTRAINT pp_pct_chk CHECK (percent >= 0 AND percent <= 100)
);
