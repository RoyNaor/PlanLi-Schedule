CREATE TABLE google_calendar_integrations (
  user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  sync_token TEXT,
  channel_id TEXT,
  resource_id TEXT,
  channel_expiration TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webcal_tokens (
  user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  feed_token_hash TEXT NOT NULL UNIQUE,
  feed_token_encrypted TEXT NOT NULL,
  token_last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calendar_event_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  schedule_version_id UUID NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  etag TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_event_links_unique_assignment UNIQUE (schedule_version_id, shift_id, user_id),
  CONSTRAINT calendar_event_links_unique_google_event UNIQUE (user_id, google_event_id)
);

CREATE TABLE calendar_external_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_external_events_unique_google_event UNIQUE (user_id, google_event_id)
);

CREATE INDEX calendar_event_links_user_week_idx
  ON calendar_event_links(user_id, week_start);

CREATE INDEX calendar_external_events_user_start_idx
  ON calendar_external_events(user_id, starts_at);

CREATE INDEX google_calendar_integrations_channel_idx
  ON google_calendar_integrations(channel_id, resource_id);
