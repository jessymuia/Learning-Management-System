-- ============================================================================
-- Migration 28 — wire grades through to the gradebook
-- Fixes the audit's central finding: quiz/assignment grades never reached
-- grade_grades. Adds a numeric grade column to submissions so assignment
-- grading can persist a score (and mirror it into grade_grades via the
-- GradebookService bridge).
-- ============================================================================

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS grade NUMERIC(12,5);   -- NULL = not yet graded (never coerce to 0)

COMMENT ON COLUMN submissions.grade IS 'Numeric grade for the submission; mirrored into grade_grades via the gradebook bridge.';
