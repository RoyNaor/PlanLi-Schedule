DROP INDEX IF EXISTS google_calendar_integrations_channel_idx;
DROP INDEX IF EXISTS calendar_external_events_user_start_idx;
DROP INDEX IF EXISTS calendar_event_links_user_week_idx;

DROP TABLE IF EXISTS calendar_external_events;
DROP TABLE IF EXISTS calendar_event_links;
DROP TABLE IF EXISTS webcal_tokens;
DROP TABLE IF EXISTS google_calendar_integrations;
