ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_staffing_positive;

ALTER TABLE shifts
ALTER COLUMN min_doctors SET DEFAULT 1,
ALTER COLUMN min_nurses SET DEFAULT 1;

ALTER TABLE shifts
ADD CONSTRAINT shifts_staffing_positive CHECK (min_doctors >= 0 AND min_nurses >= 0);

ALTER TABLE shifts
DROP COLUMN IF EXISTS min_secretaries,
DROP COLUMN IF EXISTS min_shabbat_scribes,
DROP COLUMN IF EXISTS min_pediatricians,
DROP COLUMN IF EXISTS min_orderlies,
DROP COLUMN IF EXISTS min_anesthesiologists,
DROP COLUMN IF EXISTS min_obgyns,
DROP COLUMN IF EXISTS min_midwives;
