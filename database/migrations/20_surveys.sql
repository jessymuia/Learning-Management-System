-- Module gap-fill: full surveys (spec §3 Phase 3) — questions + responses
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  course_id UUID NOT NULL,
  title TEXT NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  questions JSONB NOT NULL DEFAULT '[]',   -- [{id,text,type,options}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  survey_id UUID NOT NULL REFERENCES surveys(id),
  user_id UUID,                             -- NULL when anonymous
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY survey_tenant ON surveys USING (tenant_id = app_current_tenant());
  CREATE POLICY survey_resp_tenant ON survey_responses USING (tenant_id = app_current_tenant());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
