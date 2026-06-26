-- ============================================================================
-- 08_grading.sql — PHASE 2: Gradebook (categories, items, grades, history)
-- ============================================================================

-- ── Scales (ordinal grading) ─────────────────────────────────────────────────
CREATE TABLE scales (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,  -- NULL = tenant-global
  name        TEXT NOT NULL,
  items       JSONB NOT NULL,                     -- ["Not yet competent","Competent","Exceeds"]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scales_items_chk CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) >= 2)
);
CREATE INDEX idx_scales_course ON scales (tenant_id, course_id);

-- ── Rubrics / marking guides ─────────────────────────────────────────────────
CREATE TABLE rubrics (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,  -- NULL = reusable template
  name        TEXT NOT NULL,
  criteria    JSONB NOT NULL,                     -- [{criterion, levels:[{label, points}]}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rubrics_course ON rubrics (tenant_id, course_id);

-- ── Grade categories (per-course tree via ltree) ─────────────────────────────
CREATE TABLE grade_categories (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES grade_categories(id) ON DELETE CASCADE,
  path          LTREE NOT NULL,
  name          TEXT,
  aggregation   TEXT NOT NULL DEFAULT 'natural',  -- natural|mean|weighted_mean|simple_weighted_mean|median|min|max|mode
  drop_lowest   INT  NOT NULL DEFAULT 0,
  keep_highest  INT  NOT NULL DEFAULT 0,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gc_agg_chk CHECK (aggregation IN
    ('natural','mean','weighted_mean','simple_weighted_mean','median','min','max','mode')),
  CONSTRAINT gc_drop_keep_chk CHECK (NOT (drop_lowest > 0 AND keep_highest > 0)),
  CONSTRAINT gc_drop_chk CHECK (drop_lowest >= 0 AND keep_highest >= 0)
);
CREATE INDEX idx_gc_tenant_path ON grade_categories USING GIST (tenant_id, path);
CREATE INDEX idx_gc_course ON grade_categories (tenant_id, course_id);

-- ── Grade items ──────────────────────────────────────────────────────────────
CREATE TABLE grade_items (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES grade_categories(id) ON DELETE SET NULL,
  item_type       TEXT NOT NULL,                  -- mod|manual|category|course
  module_id       UUID REFERENCES course_modules(id) ON DELETE CASCADE,  -- when item_type='mod'
  calc_category_id UUID REFERENCES grade_categories(id) ON DELETE CASCADE, -- when item_type='category'
  name            TEXT,
  scale_id        UUID REFERENCES scales(id),     -- NULL = points grading
  grademin        NUMERIC(12,5) NOT NULL DEFAULT 0,
  grademax        NUMERIC(12,5) NOT NULL DEFAULT 100,
  gradepass       NUMERIC(12,5),
  weight          NUMERIC(12,7),                  -- explicit weight (weighted strategies)
  aggregationcoef NUMERIC(12,7),                  -- extra-credit flag / weight override
  multfactor      NUMERIC(12,5) NOT NULL DEFAULT 1,
  plusfactor      NUMERIC(12,5) NOT NULL DEFAULT 0,
  calculation     TEXT,                           -- formula for calculated items
  hidden_until    TIMESTAMPTZ,
  locked          BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gi_type_chk CHECK (item_type IN ('mod','manual','category','course')),
  CONSTRAINT gi_range_chk CHECK (grademax >= grademin),
  -- exactly one course-total item per course
  CONSTRAINT gi_mod_ref_chk CHECK (item_type <> 'mod' OR module_id IS NOT NULL)
);
CREATE INDEX idx_gi_course ON grade_items (tenant_id, course_id, sort_order);
CREATE INDEX idx_gi_module ON grade_items (tenant_id, module_id) WHERE module_id IS NOT NULL;
CREATE UNIQUE INDEX uq_gi_course_total ON grade_items (tenant_id, course_id)
  WHERE item_type = 'course';
CREATE TRIGGER trg_gi_updated BEFORE UPDATE ON grade_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Grades (one per user per item) ───────────────────────────────────────────
CREATE TABLE grade_grades (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grade_item_id  UUID NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rawgrade       NUMERIC(12,5),                   -- NULL = NOT graded (never coerce to 0)
  finalgrade     NUMERIC(12,5),                   -- after factors/penalties
  overridden     BOOLEAN NOT NULL DEFAULT FALSE,  -- manual override; recompute must not clobber
  excluded       BOOLEAN NOT NULL DEFAULT FALSE,  -- removed from aggregation, still visible
  hidden         BOOLEAN NOT NULL DEFAULT FALSE,
  locked         BOOLEAN NOT NULL DEFAULT FALSE,
  feedback       JSONB,
  marker_id      UUID REFERENCES users(id),
  workflow_state TEXT,                            -- notmarked|inmarking|complete|released
  modified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gg_wf_chk CHECK (workflow_state IS NULL OR workflow_state IN
    ('notmarked','inmarking','complete','released')),
  CONSTRAINT gg_uq UNIQUE (tenant_id, grade_item_id, user_id)
);
CREATE INDEX idx_gg_user ON grade_grades (tenant_id, user_id);
CREATE INDEX idx_gg_item ON grade_grades (tenant_id, grade_item_id);
-- grade_grades stamps modified_at (set_modified_at defined in 01_foundation)
CREATE TRIGGER trg_gg_modified BEFORE UPDATE ON grade_grades
  FOR EACH ROW EXECUTE FUNCTION set_modified_at();

-- ── Grade history (append-only audit; monthly-partitioned) ───────────────────
CREATE TABLE grade_history (
  id            UUID NOT NULL DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL,
  grade_item_id UUID NOT NULL,
  user_id       UUID NOT NULL,
  old_grade     NUMERIC(12,5),
  new_grade     NUMERIC(12,5),
  source        TEXT NOT NULL,                    -- manual|auto|regrade|import
  changed_by    UUID,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at),
  CONSTRAINT gh_source_chk CHECK (source IN ('manual','auto','regrade','import'))
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_gh_lookup ON grade_history (tenant_id, grade_item_id, user_id, created_at DESC);

-- ── Gradebook summary (denormalized read model) ──────────────────────────────
CREATE TABLE gradebook_summary (
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_total  NUMERIC(12,5),
  course_total_pct NUMERIC(6,3),
  items         JSONB NOT NULL DEFAULT '{}',      -- {grade_item_id: finalgrade}
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, course_id, user_id)
);

-- ── Letter boundaries (percentage -> letter, per course) ─────────────────────
CREATE TABLE grade_letters (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,  -- NULL = tenant default
  letter      TEXT NOT NULL,                      -- A|B|C|...
  low_pct     NUMERIC(6,3) NOT NULL,              -- inclusive lower bound
  CONSTRAINT gl_pct_chk CHECK (low_pct >= 0 AND low_pct <= 100),
  CONSTRAINT gl_uq UNIQUE (tenant_id, course_id, letter)
);
