CREATE TABLE schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL REFERENCES weeks(week_start) ON DELETE CASCADE,
  triggered_by VARCHAR(128) NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  solver_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL REFERENCES weeks(week_start) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES schedule_runs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(128) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_versions_unique_week_version UNIQUE (week_start, version_number)
);

CREATE TABLE schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  source VARCHAR(20) NOT NULL DEFAULT 'solver' CHECK (source IN ('solver', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_assignments_unique_assignment UNIQUE (schedule_version_id, shift_id, user_id)
);

CREATE INDEX schedule_runs_week_status_idx ON schedule_runs(week_start, status);
CREATE INDEX schedule_versions_week_idx ON schedule_versions(week_start, created_at DESC);
CREATE INDEX schedule_assignments_version_shift_idx ON schedule_assignments(schedule_version_id, shift_id);
