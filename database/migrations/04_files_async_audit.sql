-- ============================================================================
-- 04_files_async_audit.sql — File API, async job ledger, audit & event logs
-- ============================================================================

-- ── Content-addressed files ──────────────────────────────────────────────────
-- Bytes live once in object storage keyed by SHA-256; this table is the logical
-- file tree (which component/area/context/item references those bytes).
-- Dedup is global per (tenant, contenthash) but a row exists per logical ref.
CREATE TABLE files (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contenthash  CHAR(64) NOT NULL,                  -- SHA-256 hex of the bytes
  component    TEXT NOT NULL,                       -- mod_assign|question|user|...
  filearea     TEXT NOT NULL,                       -- submission|intro|avatar|...
  context_id   UUID NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL,                       -- owning row (submission id, etc.)
  filepath     TEXT NOT NULL DEFAULT '/',           -- logical folder path within area
  filename     TEXT NOT NULL,
  filesize     BIGINT NOT NULL,
  mimetype     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',     -- pending|clean|infected|quarantined
  scanned_at   TIMESTAMPTZ,                         -- virus-scan hook result time
  created_by   UUID,                                -- users.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT files_size_chk CHECK (filesize >= 0),
  CONSTRAINT files_hash_chk CHECK (contenthash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT files_status_chk CHECK (status IN ('pending','clean','infected','quarantined')),
  -- a given logical slot holds one file of a given name
  CONSTRAINT files_logical_uq UNIQUE (tenant_id, context_id, component, filearea, item_id, filepath, filename)
);
CREATE INDEX idx_files_area ON files (tenant_id, context_id, component, filearea, item_id);
CREATE INDEX idx_files_hash ON files (tenant_id, contenthash);   -- dedup / GC refcount

-- Optional: physical blob registry for refcount-based GC (one row per unique hash)
CREATE TABLE file_blobs (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contenthash  CHAR(64) NOT NULL,
  filesize     BIGINT NOT NULL,
  storage_key  TEXT NOT NULL,                       -- object-storage path
  refcount     BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contenthash),
  CONSTRAINT blobs_hash_chk CHECK (contenthash ~ '^[0-9a-f]{64}$')
);

-- ── Audit log (append-only; security/authz/grade-sensitive actions) ──────────
-- This is the compliance audit trail (who did what), distinct from the
-- analytics event_log below. Partition by month for trivial archival.
CREATE TABLE audit_log (
  id          UUID NOT NULL DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID,                                 -- users.id (NULL = system)
  action      TEXT NOT NULL,                         -- role.assign|grade.override|login|...
  target_type TEXT,                                  -- table/entity name
  target_id   UUID,
  context_id  UUID,
  ip          INET,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at)
) PARTITION BY RANGE (created_at);

-- ── Analytics/activity event log (high-volume; feeds ClickHouse later) ───────
CREATE TABLE event_log (
  id          UUID NOT NULL DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  user_id     UUID,
  course_id   UUID,
  context_id  UUID,
  event_name  TEXT NOT NULL,
  target      TEXT,
  object_id   UUID,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at)
) PARTITION BY RANGE (created_at);

-- ── Async job ledger (idempotency + dead-letter visibility) ──────────────────
-- The durable queue lives in SQS/RabbitMQ; this table gives idempotency keys,
-- coalescing, and a queryable DLQ. Workers upsert on idempotency_key.
CREATE TABLE async_jobs (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  queue           TEXT NOT NULL,                     -- grade_recompute|regrade|notify|...
  idempotency_key TEXT NOT NULL,                     -- e.g. recompute:<course>:<user>
  status          TEXT NOT NULL DEFAULT 'queued',    -- queued|running|done|failed|dead
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  payload         JSONB NOT NULL DEFAULT '{}',
  last_error      TEXT,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT aj_status_chk CHECK (status IN ('queued','running','done','failed','dead')),
  -- coalescing: one live job per idempotency key (done/dead don't block re-enqueue)
  CONSTRAINT aj_idem_uq UNIQUE (tenant_id, queue, idempotency_key)
);
CREATE INDEX idx_aj_due ON async_jobs (queue, status, available_at)
  WHERE status IN ('queued','failed');
CREATE TRIGGER trg_aj_updated BEFORE UPDATE ON async_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
