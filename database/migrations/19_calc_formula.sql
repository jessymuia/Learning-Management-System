-- Module gap-fill: calculated grade item formulas (spec §5.3-5.4)
ALTER TABLE grade_items ADD COLUMN IF NOT EXISTS calc_formula TEXT;
