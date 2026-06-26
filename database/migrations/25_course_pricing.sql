-- ============================================================================
-- Migration 25 — course pricing (Payment & Enrolment module, Doc 2)
-- Adds price + payment-required flags to courses so a course can be free or
-- paid. Access to a paid course is granted only after a succeeded payment.
-- ============================================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_paid          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_minor      BIGINT  NOT NULL DEFAULT 0,   -- integer minor units (e.g. cents)
  ADD COLUMN IF NOT EXISTS currency         TEXT    NOT NULL DEFAULT 'KES';

ALTER TABLE courses
  ADD CONSTRAINT crs_price_chk CHECK (price_minor >= 0);

-- A course flagged paid must carry a positive price.
ALTER TABLE courses
  ADD CONSTRAINT crs_paid_price_chk CHECK (NOT is_paid OR price_minor > 0);

COMMENT ON COLUMN courses.is_paid     IS 'When true, learners must pay price_minor before enrolment is activated.';
COMMENT ON COLUMN courses.price_minor IS 'Course price in integer minor units of currency (e.g. KES cents).';
