ALTER TABLE constraints
DROP COLUMN IF EXISTS is_full_day;

ALTER TABLE constraints
ALTER COLUMN start_time TYPE TIMESTAMP USING start_time AT TIME ZONE 'Asia/Jerusalem',
ALTER COLUMN end_time TYPE TIMESTAMP USING end_time AT TIME ZONE 'Asia/Jerusalem';
