-- ============================================================================
-- 17_partitions_all.sql — Register all partitioned parents for monthly mgmt
-- ----------------------------------------------------------------------------
-- Some partitioned tables use a partition key other than 'created_at'
-- (xapi_statements uses stored_at, usage_metering uses recorded_at). The
-- create_month_partition() helper is column-agnostic (FOR VALUES FROM..TO on
-- the parent's declared key), so we just register every parent here.
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_month_partitions(p_months_ahead int DEFAULT 2)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  parents text[] := ARRAY[
    'audit_log','event_log','grade_history','attempt_steps',
    'lti_launches','webhook_deliveries','xapi_statements','usage_metering','notifications'
  ];
  par text; i int;
BEGIN
  FOREACH par IN ARRAY parents LOOP
    -- skip parents that don't exist yet (keeps this idempotent & order-tolerant)
    IF to_regclass(par) IS NULL THEN
      CONTINUE;
    END IF;
    FOR i IN -1 .. p_months_ahead LOOP
      PERFORM create_month_partition(par::regclass,
        (date_trunc('month', now()) + (i || ' month')::interval)::date);
    END LOOP;
  END LOOP;
END;
$$;
SELECT ensure_month_partitions(3);
