ALTER TABLE weeks
ADD COLUMN published_at TIMESTAMPTZ,
ADD COLUMN published_schedule_version_id UUID;

ALTER TABLE weeks
ADD CONSTRAINT weeks_published_schedule_version_fk
FOREIGN KEY (published_schedule_version_id) REFERENCES schedule_versions(id) ON DELETE SET NULL;

CREATE INDEX weeks_published_schedule_version_idx ON weeks(published_schedule_version_id);
