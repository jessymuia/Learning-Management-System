-- ============================================================================
-- Migration 26 — Lessons layer (Program → Course → Unit/Section → Lesson → Activity)
-- A lesson groups related activities inside a section/unit, matching the spec's
-- teaching structure. Activities (content_modules) can optionally belong to a lesson.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lessons (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  summary      JSONB,
  sort_order   INT  NOT NULL DEFAULT 0,
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_section ON lessons (tenant_id, section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lessons_course  ON lessons (tenant_id, course_id);

-- Activities (course_modules) may belong to a lesson. NULL = directly under the section.
ALTER TABLE course_modules
  ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_modules_lesson ON course_modules (tenant_id, lesson_id);

-- RLS: tenant isolation (same pattern as other tenant tables)
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lessons_tenant_isolation ON lessons;
CREATE POLICY lessons_tenant_isolation ON lessons
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid
         OR current_setting('app.bypass_rls', true) = 'on');

COMMENT ON TABLE lessons IS 'Lesson layer: groups activities within a section/unit (Program→Course→Unit→Lesson→Activity).';
