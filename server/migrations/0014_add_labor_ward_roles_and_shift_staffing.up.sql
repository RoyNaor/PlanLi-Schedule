ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS min_midwives INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_obgyns INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_anesthesiologists INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_orderlies INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_pediatricians INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_shabbat_scribes INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_secretaries INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shifts
ALTER COLUMN min_doctors SET DEFAULT 0,
ALTER COLUMN min_nurses SET DEFAULT 0;

ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_staffing_positive;

ALTER TABLE shifts
ADD CONSTRAINT shifts_staffing_positive CHECK (
  min_doctors >= 0
  AND min_nurses >= 0
  AND min_midwives >= 0
  AND min_obgyns >= 0
  AND min_anesthesiologists >= 0
  AND min_orderlies >= 0
  AND min_pediatricians >= 0
  AND min_shabbat_scribes >= 0
  AND min_secretaries >= 0
);
