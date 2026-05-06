CREATE TABLE worker_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'excel',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX worker_types_active_name_idx ON worker_types(is_active, name);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS worker_type_id UUID REFERENCES worker_types(id) ON DELETE SET NULL;

CREATE TABLE months (
  month_start DATE PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COLLECTING', 'LOCKED', 'SOLVED', 'PUBLISHED')),
  collection_open_at TIMESTAMPTZ,
  collection_deadline TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_monthly_schedule_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT months_must_start_on_first CHECK (date_trunc('month', month_start)::date = month_start)
);

CREATE TABLE arrangements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT arrangements_unique_department_code UNIQUE (department_id, code)
);

CREATE INDEX arrangements_department_active_idx ON arrangements(department_id, is_active, name);

ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_time_order;

ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS month_start DATE REFERENCES months(month_start) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS arrangement_id UUID REFERENCES arrangements(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX shifts_month_department_date_idx ON shifts(month_start, department_id, shift_date, start_time);
CREATE INDEX shifts_arrangement_idx ON shifts(arrangement_id);

CREATE TABLE shift_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  worker_type_id UUID NOT NULL REFERENCES worker_types(id) ON DELETE CASCADE,
  required_count INTEGER NOT NULL DEFAULT 1 CHECK (required_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_requirements_unique_shift_type UNIQUE (shift_id, worker_type_id)
);

CREATE INDEX shift_requirements_type_idx ON shift_requirements(worker_type_id);

CREATE TABLE worker_eligibilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_type_id UUID NOT NULL REFERENCES worker_types(id) ON DELETE CASCADE,
  month_start DATE REFERENCES months(month_start) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  arrangement_id UUID REFERENCES arrangements(id) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL DEFAULT 'excel',
  source_sheet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX worker_eligibilities_unique_idx
ON worker_eligibilities (
  user_id,
  worker_type_id,
  COALESCE(month_start, DATE '0001-01-01'),
  COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(arrangement_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX worker_eligibilities_month_department_idx ON worker_eligibilities(month_start, department_id);

CREATE TABLE worker_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_start DATE REFERENCES months(month_start) ON DELETE CASCADE,
  state_type VARCHAR(80) NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('HARD', 'SOFT')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_full_day BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  source_sheet TEXT,
  source_cell TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT worker_states_time_order CHECK (end_time > start_time)
);

CREATE INDEX worker_states_month_user_idx ON worker_states(month_start, user_id, start_time);
CREATE INDEX worker_states_priority_idx ON worker_states(priority);

CREATE TABLE monthly_schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start DATE NOT NULL REFERENCES months(month_start) ON DELETE CASCADE,
  triggered_by VARCHAR(128) NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  solver_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE monthly_schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start DATE NOT NULL REFERENCES months(month_start) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES monthly_schedule_runs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(128) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monthly_schedule_versions_unique_month_version UNIQUE (month_start, version_number)
);

ALTER TABLE months
ADD CONSTRAINT months_published_monthly_version_fk
FOREIGN KEY (published_monthly_schedule_version_id)
REFERENCES monthly_schedule_versions(id)
ON DELETE SET NULL;

CREATE TABLE monthly_schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_schedule_version_id UUID NOT NULL REFERENCES monthly_schedule_versions(id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  worker_type_id UUID REFERENCES worker_types(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  arrangement_id UUID REFERENCES arrangements(id) ON DELETE SET NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'solver' CHECK (source IN ('solver', 'manual', 'excel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monthly_schedule_assignments_unique_assignment UNIQUE (monthly_schedule_version_id, shift_id, user_id)
);

CREATE INDEX monthly_schedule_runs_month_status_idx ON monthly_schedule_runs(month_start, status);
CREATE INDEX monthly_schedule_versions_month_idx ON monthly_schedule_versions(month_start, created_at DESC);
CREATE INDEX monthly_schedule_assignments_version_shift_idx ON monthly_schedule_assignments(monthly_schedule_version_id, shift_id);
