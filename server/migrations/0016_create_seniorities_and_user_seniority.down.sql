ALTER TABLE users
DROP COLUMN IF EXISTS seniority_id;

DROP INDEX IF EXISTS seniorities_active_sort_name_idx;
DROP TABLE IF EXISTS seniorities;
