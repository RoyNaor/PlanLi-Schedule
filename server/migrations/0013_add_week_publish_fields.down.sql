DROP INDEX IF EXISTS weeks_published_schedule_version_idx;

ALTER TABLE weeks
DROP CONSTRAINT IF EXISTS weeks_published_schedule_version_fk;

ALTER TABLE weeks
DROP COLUMN IF EXISTS published_schedule_version_id,
DROP COLUMN IF EXISTS published_at;
