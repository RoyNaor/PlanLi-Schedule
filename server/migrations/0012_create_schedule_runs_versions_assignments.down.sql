DROP INDEX IF EXISTS schedule_assignments_version_shift_idx;
DROP INDEX IF EXISTS schedule_versions_week_idx;
DROP INDEX IF EXISTS schedule_runs_week_status_idx;

DROP TABLE IF EXISTS schedule_assignments;
DROP TABLE IF EXISTS schedule_versions;
DROP TABLE IF EXISTS schedule_runs;
