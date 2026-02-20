ALTER TABLE constraints
ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE current_setting('TIMEZONE'),
ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE current_setting('TIMEZONE');

ALTER TABLE constraints
ADD COLUMN is_full_day BOOLEAN NOT NULL DEFAULT false;
