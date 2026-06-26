-- ============================================================================
-- 10_immutability_triggers.sql — Enforce append-only / immutability invariants
-- ============================================================================

-- A question_version that is referenced by any attempt may not be mutated.
CREATE OR REPLACE FUNCTION forbid_referenced_version_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.question_version_id = OLD.id) THEN
    RAISE EXCEPTION 'question_version % is referenced by an attempt and is immutable', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_qv_immutable BEFORE UPDATE OR DELETE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_referenced_version_update();

-- Append-only guards: block UPDATE/DELETE on the audit/history/log tables.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER trg_gh_append_only BEFORE UPDATE OR DELETE ON grade_history
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_as_append_only BEFORE UPDATE OR DELETE ON attempt_steps
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
