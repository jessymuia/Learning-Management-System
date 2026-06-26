-- ============================================================================
-- 14_integrations.sql — PHASE 4: LTI, SCORM, payments, webhooks
-- ============================================================================

-- ── LTI 1.3 / Advantage ──────────────────────────────────────────────────────
CREATE TABLE lti_registrations (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'consumer',  -- consumer|provider
  issuer       TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  deployment_id TEXT,
  auth_endpoint TEXT,
  token_endpoint TEXT,
  jwks_uri     TEXT,
  public_key   TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lti_role_chk CHECK (role IN ('consumer','provider')),
  CONSTRAINT lti_reg_uq UNIQUE (tenant_id, issuer, client_id)
);

CREATE TABLE lti_launches (
  id              UUID NOT NULL DEFAULT uuidv7(),
  tenant_id       UUID NOT NULL,
  registration_id UUID NOT NULL,
  user_id         UUID,
  course_id       UUID,
  module_id       UUID,
  message_type    TEXT,                           -- resource_link|deep_linking
  nonce           TEXT,
  state           TEXT,
  ags_lineitem    TEXT,                           -- grade-passback endpoint
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_lti_launch_reg ON lti_launches (tenant_id, registration_id);

-- ── SCORM ────────────────────────────────────────────────────────────────────
CREATE TABLE scorm_packages (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT 'scorm_12',   -- scorm_12|scorm_2004
  manifest    JSONB NOT NULL DEFAULT '{}',        -- parsed imsmanifest
  package_file_id UUID REFERENCES files(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scorm_ver_chk CHECK (version IN ('scorm_12','scorm_2004'))
);
CREATE INDEX idx_scorm_course ON scorm_packages (tenant_id, course_id);

CREATE TABLE scorm_tracks (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id  UUID NOT NULL REFERENCES scorm_packages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sco_id      TEXT NOT NULL,                      -- identifies the SCO within the package
  element     TEXT NOT NULL,                      -- cmi.core.lesson_status, cmi.core.score.raw, ...
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scorm_track_uq UNIQUE (tenant_id, package_id, user_id, sco_id, element)
);
CREATE INDEX idx_scorm_track_user ON scorm_tracks (tenant_id, user_id, package_id);
CREATE TRIGGER trg_scorm_track_updated BEFORE UPDATE ON scorm_tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Payments (Stripe / M-Pesa Daraja / KRA eTIMS) ────────────────────────────
CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL,                     -- course|program
  item_id      UUID NOT NULL,
  amount_minor BIGINT NOT NULL,                   -- integer minor units
  currency     CHAR(3) NOT NULL DEFAULT 'KES',
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|failed|refunded
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ord_item_chk CHECK (item_type IN ('course','program')),
  CONSTRAINT ord_status_chk CHECK (status IN ('pending','paid','failed','refunded')),
  CONSTRAINT ord_amount_chk CHECK (amount_minor >= 0)
);
CREATE INDEX idx_orders_user ON orders (tenant_id, user_id);

CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,                    -- stripe|mpesa|manual
  provider_ref  TEXT,                             -- charge id / mpesa receipt
  amount_minor  BIGINT NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'KES',
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|succeeded|failed|refunded
  raw           JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pay_provider_chk CHECK (provider IN ('stripe','mpesa','manual')),
  CONSTRAINT pay_status_chk CHECK (status IN ('pending','succeeded','failed','refunded')),
  CONSTRAINT pay_provider_ref_uq UNIQUE (tenant_id, provider, provider_ref)
);
CREATE INDEX idx_pay_order ON payments (tenant_id, order_id);

CREATE TABLE invoices (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  number       TEXT NOT NULL,
  etims_ref    TEXT,                              -- KRA eTIMS invoice reference
  pdf_file_id  UUID REFERENCES files(id),
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inv_number_uq UNIQUE (tenant_id, number)
);

-- ── Webhooks ─────────────────────────────────────────────────────────────────
CREATE TABLE webhooks (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      JSONB NOT NULL DEFAULT '[]',        -- subscribed event names
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id          UUID NOT NULL DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  webhook_id  UUID NOT NULL,
  event_name  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',    -- pending|delivered|failed
  attempts    INT NOT NULL DEFAULT 0,
  response_code INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, created_at),
  CONSTRAINT whd_status_chk CHECK (status IN ('pending','delivered','failed'))
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_whd_webhook ON webhook_deliveries (tenant_id, webhook_id, created_at DESC);

-- ── xAPI statements (LRS pipeline) ───────────────────────────────────────────
CREATE TABLE xapi_statements (
  id          UUID NOT NULL DEFAULT uuidv7(),
  tenant_id   UUID NOT NULL,
  actor       JSONB NOT NULL,
  verb        JSONB NOT NULL,
  object      JSONB NOT NULL,
  result      JSONB,
  context     JSONB,
  stored_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id, stored_at)
) PARTITION BY RANGE (stored_at);
CREATE INDEX idx_xapi_tenant ON xapi_statements (tenant_id, stored_at DESC);
