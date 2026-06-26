-- ============================================================================
-- 05_partitions.sql — Monthly partition management for time-series tables
-- ----------------------------------------------------------------------------
-- Creates a partition for a given month on a given parent, idempotently.
-- A scheduled job calls ensure_month_partitions() ahead of time (e.g. nightly,
-- provisioning next month). Old partitions are DETACHed + archived separately.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_month_partition(p_parent regclass, p_month date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_d date := date_trunc('month', p_month)::date;
  end_d   date := (date_trunc('month', p_month) + interval '1 month')::date;
  part    text := format('%s_%s', p_parent::text, to_char(start_d, 'YYYYMM'));
BEGIN
  IF to_regclass(part) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
      part, p_parent::text, start_d, end_d);
  END IF;
END;
$$;

-- Provision current month +/- a buffer for all partitioned parents.
CREATE OR REPLACE FUNCTION ensure_month_partitions(p_months_ahead int DEFAULT 2)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  parents text[] := ARRAY['audit_log','event_log'];  -- extended in later phases
  par text; i int;
BEGIN
  FOREACH par IN ARRAY parents LOOP
    FOR i IN -1 .. p_months_ahead LOOP
      PERFORM create_month_partition(par::regclass,
                                     (date_trunc('month', now()) + (i || ' month')::interval)::date);
    END LOOP;
  END LOOP;
END;
$$;

SELECT ensure_month_partitions(3);
