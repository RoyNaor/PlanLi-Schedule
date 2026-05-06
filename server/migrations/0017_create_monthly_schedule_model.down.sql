DROP TABLE IF EXISTS monthly_schedule_assignments;

ALTER TABLE months
DROP CONSTRAINT IF EXISTS months_published_monthly_version_fk;

DROP TABLE IF EXISTS monthly_schedule_versions;
DROP TABLE IF EXISTS monthly_schedule_runs;
DROP TABLE IF EXISTS worker_states;
DROP INDEX IF EXISTS worker_eligibilities_unique_idx;
DROP TABLE IF EXISTS worker_eligibilities;
DROP TABLE IF EXISTS shift_requirements;

ALTER TABLE shifts
DROP COLUMN IF EXISTS label,
DROP COLUMN IF EXISTS arrangement_id,
DROP COLUMN IF EXISTS department_id,
DROP COLUMN IF EXISTS month_start;

DROP TABLE IF EXISTS arrangements;
DROP TABLE IF EXISTS months;

ALTER TABLE users
DROP COLUMN IF EXISTS worker_type_id;

DROP TABLE IF EXISTS worker_types;
