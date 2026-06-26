-- ============================================================================
-- 18_notifications.sql — Notifications (§7.5). High-volume, monthly-partitioned.
-- Per-user delivery preferences live in users.profile; this table is the
-- queued/sent delivery ledger across channels.
-- ============================================================================
CREATE TABLE notifications (
  id        UUID NOT NULL DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  user_id   UUID NOT NULL,
  channel   TEXT NOT NULL,                    -- email|sms|push|inapp
  type      TEXT NOT NULL,                    -- template/event key
  payload   JSONB NOT NULL DEFAULT '{}',
  sent_at   TIMESTAMPTZ,
  read_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at),
  CONSTRAINT notif_channel_chk CHECK (channel IN ('email','sms','push','inapp'))
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_notif_user ON notifications (tenant_id, user_id, created_at DESC);
CREATE INDEX idx_notif_unsent ON notifications (tenant_id, channel, created_at)
  WHERE sent_at IS NULL;

-- RLS (matches every other tenant-scoped table)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING (app_bypass_rls() OR tenant_id = app_current_tenant())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- provision partitions for notifications now that the table exists
SELECT ensure_month_partitions(3);
