DROP INDEX IF EXISTS weeks_collection_deadline_idx;
DROP INDEX IF EXISTS weeks_status_idx;

ALTER TABLE weeks
DROP CONSTRAINT IF EXISTS weeks_status_check;

ALTER TABLE weeks
DROP COLUMN IF EXISTS locked_at,
DROP COLUMN IF EXISTS collection_deadline,
DROP COLUMN IF EXISTS collection_open_at,
DROP COLUMN IF EXISTS status;
