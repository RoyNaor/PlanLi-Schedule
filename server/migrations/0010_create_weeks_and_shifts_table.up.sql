CREATE TABLE weeks (
  week_start DATE PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shifts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_start DATE NOT NULL,
  shift_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_doctors INTEGER NOT NULL DEFAULT 1,
  min_nurses INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shifts_week_fk FOREIGN KEY (week_start) REFERENCES weeks(week_start) ON DELETE CASCADE,
  CONSTRAINT shifts_staffing_positive CHECK (min_doctors >= 0 AND min_nurses >= 0),
  CONSTRAINT shifts_time_order CHECK (start_time < end_time)
);

CREATE INDEX shifts_week_start_idx ON shifts(week_start);
CREATE INDEX shifts_shift_date_idx ON shifts(shift_date);
