ALTER TABLE weeks
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
ADD COLUMN collection_open_at TIMESTAMPTZ,
ADD COLUMN collection_deadline TIMESTAMPTZ,
ADD COLUMN locked_at TIMESTAMPTZ;

ALTER TABLE weeks
ADD CONSTRAINT weeks_status_check
CHECK (status IN ('DRAFT', 'COLLECTING', 'LOCKED', 'SOLVED', 'PUBLISHED'));

CREATE INDEX weeks_status_idx ON weeks(status);
CREATE INDEX weeks_collection_deadline_idx ON weeks(collection_deadline);
