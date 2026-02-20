ALTER TABLE constraints
ADD CONSTRAINT constraints_end_after_start
CHECK (end_time > start_time);
