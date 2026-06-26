-- ============================================================================
-- 13_content_video.sql — Content & video activity instances (§7.6)
-- These back course_modules.module_type='content'. (Phase 1 content delivery
-- + Phase 4 video providers; placed here so the FK target exists for both.)
-- ============================================================================

CREATE TABLE content_activities (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                      -- video|page|file|url|book|folder
  title       TEXT NOT NULL,
  body        JSONB,                              -- rich-text/page content
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ca_kind_chk CHECK (kind IN ('video','page','file','url','book','folder'))
);
CREATE INDEX idx_ca_course ON content_activities (tenant_id, course_id);
CREATE TRIGGER trg_ca_updated BEFORE UPDATE ON content_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE video_sources (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content_activities(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,                      -- youtube|vimeo|mux|cloudflare_stream|self
  external_id TEXT,
  url         TEXT,
  gated       BOOLEAN NOT NULL DEFAULT FALSE,     -- TRUE = signed-URL delivery
  duration_s  INT,
  captions    JSONB,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vs_provider_chk CHECK (provider IN
    ('youtube','vimeo','mux','cloudflare_stream','self')),
  CONSTRAINT vs_duration_chk CHECK (duration_s IS NULL OR duration_s >= 0)
);
CREATE INDEX idx_vs_content ON video_sources (tenant_id, content_id);
