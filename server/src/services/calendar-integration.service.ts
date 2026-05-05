import { queryDatabase } from "./database.service.js";
import { CalendarCryptoService } from "./calendar-crypto.service.js";

interface GoogleCalendarIntegrationRow {
  user_id: string;
  access_token: string;
  refresh_token_encrypted: string;
  access_token_expires_at: Date;
  sync_token: string | null;
  channel_id: string | null;
  resource_id: string | null;
  channel_expiration: Date | null;
  last_sync_at: Date | null;
}

interface WebcalTokenRow {
  user_id: string;
  feed_token_hash: string;
  feed_token_encrypted: string;
  token_last_rotated_at: Date;
}

interface CalendarExternalEventRow {
  user_id: string;
  google_event_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  source_updated_at: Date | null;
  raw_payload: Record<string, unknown>;
}

export interface GoogleIntegration {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  syncToken: string | null;
  channelId: string | null;
  resourceId: string | null;
  channelExpiration: Date | null;
  lastSyncAt: Date | null;
}

export interface CalendarEventLink {
  userId: string;
  weekStart: string;
  scheduleVersionId: string;
  shiftId: number;
  googleEventId: string;
}

function mapIntegration(row: GoogleCalendarIntegrationRow): GoogleIntegration {
  return {
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: CalendarCryptoService.decrypt(row.refresh_token_encrypted),
    accessTokenExpiresAt: row.access_token_expires_at,
    syncToken: row.sync_token,
    channelId: row.channel_id,
    resourceId: row.resource_id,
    channelExpiration: row.channel_expiration,
    lastSyncAt: row.last_sync_at,
  };
}

export const CalendarIntegrationService = {
  async upsertGoogleTokens(input: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
  }): Promise<void> {
    await queryDatabase(
      `INSERT INTO google_calendar_integrations (
         user_id,
         access_token,
         refresh_token_encrypted,
         access_token_expires_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         updated_at = NOW()`,
      [
        input.userId,
        input.accessToken,
        CalendarCryptoService.encrypt(input.refreshToken),
        input.accessTokenExpiresAt,
      ],
    );
  },

  async getGoogleIntegrationByUserId(userId: string): Promise<GoogleIntegration | null> {
    const result = await queryDatabase<GoogleCalendarIntegrationRow>(
      `SELECT user_id,
              access_token,
              refresh_token_encrypted,
              access_token_expires_at,
              sync_token,
              channel_id,
              resource_id,
              channel_expiration,
              last_sync_at
       FROM google_calendar_integrations
       WHERE user_id = $1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? mapIntegration(row) : null;
  },

  async getGoogleIntegrationByChannel(input: {
    channelId: string;
    resourceId: string;
  }): Promise<GoogleIntegration | null> {
    const result = await queryDatabase<GoogleCalendarIntegrationRow>(
      `SELECT user_id,
              access_token,
              refresh_token_encrypted,
              access_token_expires_at,
              sync_token,
              channel_id,
              resource_id,
              channel_expiration,
              last_sync_at
       FROM google_calendar_integrations
       WHERE channel_id = $1
         AND resource_id = $2
       LIMIT 1`,
      [input.channelId, input.resourceId],
    );

    const row = result.rows[0];
    return row ? mapIntegration(row) : null;
  },

  async updateAccessToken(input: {
    userId: string;
    accessToken: string;
    accessTokenExpiresAt: Date;
  }): Promise<void> {
    await queryDatabase(
      `UPDATE google_calendar_integrations
       SET access_token = $2,
           access_token_expires_at = $3,
           updated_at = NOW()
       WHERE user_id = $1`,
      [input.userId, input.accessToken, input.accessTokenExpiresAt],
    );
  },

  async updateSyncToken(input: {
    userId: string;
    syncToken: string | null;
  }): Promise<void> {
    await queryDatabase(
      `UPDATE google_calendar_integrations
       SET sync_token = $2,
           last_sync_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1`,
      [input.userId, input.syncToken],
    );
  },

  async updateWatchChannel(input: {
    userId: string;
    channelId: string;
    resourceId: string;
    channelExpiration: Date | null;
  }): Promise<void> {
    await queryDatabase(
      `UPDATE google_calendar_integrations
       SET channel_id = $2,
           resource_id = $3,
           channel_expiration = $4,
           updated_at = NOW()
       WHERE user_id = $1`,
      [input.userId, input.channelId, input.resourceId, input.channelExpiration],
    );
  },

  async clearWatchChannel(userId: string): Promise<void> {
    await queryDatabase(
      `UPDATE google_calendar_integrations
       SET channel_id = NULL,
           resource_id = NULL,
           channel_expiration = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  },

  async listExpiringChannels(withinHours: number): Promise<GoogleIntegration[]> {
    const result = await queryDatabase<GoogleCalendarIntegrationRow>(
      `SELECT user_id,
              access_token,
              refresh_token_encrypted,
              access_token_expires_at,
              sync_token,
              channel_id,
              resource_id,
              channel_expiration,
              last_sync_at
       FROM google_calendar_integrations
       WHERE channel_id IS NOT NULL
         AND resource_id IS NOT NULL
         AND channel_expiration IS NOT NULL
         AND channel_expiration <= NOW() + ($1 || ' hours')::interval`,
      [String(withinHours)],
    );

    return result.rows.map(mapIntegration);
  },

  async deleteGoogleIntegration(userId: string): Promise<void> {
    await queryDatabase(`DELETE FROM google_calendar_integrations WHERE user_id = $1`, [
      userId,
    ]);
  },

  async upsertEventLink(input: {
    userId: string;
    weekStart: string;
    scheduleVersionId: string;
    shiftId: number;
    googleEventId: string;
    etag: string | null;
  }): Promise<void> {
    await queryDatabase(
      `INSERT INTO calendar_event_links (
         user_id,
         week_start,
         schedule_version_id,
         shift_id,
         google_event_id,
         etag,
         last_synced_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (schedule_version_id, shift_id, user_id)
       DO UPDATE SET
         google_event_id = EXCLUDED.google_event_id,
         etag = EXCLUDED.etag,
         week_start = EXCLUDED.week_start,
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [
        input.userId,
        input.weekStart,
        input.scheduleVersionId,
        input.shiftId,
        input.googleEventId,
        input.etag,
      ],
    );
  },

  async getEventLink(input: {
    userId: string;
    scheduleVersionId: string;
    shiftId: number;
  }): Promise<CalendarEventLink | null> {
    const result = await queryDatabase<{
      user_id: string;
      week_start: string;
      schedule_version_id: string;
      shift_id: number;
      google_event_id: string;
    }>(
      `SELECT user_id,
              week_start::text AS week_start,
              schedule_version_id,
              shift_id,
              google_event_id
       FROM calendar_event_links
       WHERE user_id = $1
         AND schedule_version_id = $2
         AND shift_id = $3`,
      [input.userId, input.scheduleVersionId, input.shiftId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      weekStart: row.week_start,
      scheduleVersionId: row.schedule_version_id,
      shiftId: row.shift_id,
      googleEventId: row.google_event_id,
    };
  },

  async listEventLinksByWeek(input: { userId: string; weekStart: string }): Promise<CalendarEventLink[]> {
    const result = await queryDatabase<{
      user_id: string;
      week_start: string;
      schedule_version_id: string;
      shift_id: number;
      google_event_id: string;
    }>(
      `SELECT user_id,
              week_start::text AS week_start,
              schedule_version_id,
              shift_id,
              google_event_id
       FROM calendar_event_links
       WHERE user_id = $1
         AND week_start = $2`,
      [input.userId, input.weekStart],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      weekStart: row.week_start,
      scheduleVersionId: row.schedule_version_id,
      shiftId: row.shift_id,
      googleEventId: row.google_event_id,
    }));
  },

  async deleteEventLink(input: {
    userId: string;
    scheduleVersionId: string;
    shiftId: number;
  }): Promise<void> {
    await queryDatabase(
      `DELETE FROM calendar_event_links
       WHERE user_id = $1
         AND schedule_version_id = $2
         AND shift_id = $3`,
      [input.userId, input.scheduleVersionId, input.shiftId],
    );
  },

  async deleteEventLinkByGoogleEventId(input: {
    userId: string;
    googleEventId: string;
  }): Promise<void> {
    await queryDatabase(
      `DELETE FROM calendar_event_links
       WHERE user_id = $1
         AND google_event_id = $2`,
      [input.userId, input.googleEventId],
    );
  },

  async listIntegratedUserIdsByWeek(weekStart: string): Promise<string[]> {
    const result = await queryDatabase<{ user_id: string }>(
      `SELECT DISTINCT sa.user_id
       FROM schedule_assignments sa
       INNER JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
       INNER JOIN google_calendar_integrations gci ON gci.user_id = sa.user_id
       WHERE sv.week_start = $1
         AND sv.is_published = TRUE`,
      [weekStart],
    );
    return result.rows.map((row) => row.user_id);
  },

  async rotateWebcalToken(userId: string): Promise<string> {
    const token = CalendarCryptoService.generateOpaqueToken();
    const tokenHash = CalendarCryptoService.hashFeedToken(token);
    const tokenEncrypted = CalendarCryptoService.encrypt(token);

    await queryDatabase(
      `INSERT INTO webcal_tokens (
         user_id,
         feed_token_hash,
         feed_token_encrypted,
         token_last_rotated_at,
         updated_at
       )
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         feed_token_hash = EXCLUDED.feed_token_hash,
         feed_token_encrypted = EXCLUDED.feed_token_encrypted,
         token_last_rotated_at = NOW(),
         updated_at = NOW()`,
      [userId, tokenHash, tokenEncrypted],
    );

    return token;
  },

  async getWebcalTokenByUserId(userId: string): Promise<string | null> {
    const result = await queryDatabase<WebcalTokenRow>(
      `SELECT user_id,
              feed_token_hash,
              feed_token_encrypted,
              token_last_rotated_at
       FROM webcal_tokens
       WHERE user_id = $1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return CalendarCryptoService.decrypt(row.feed_token_encrypted);
  },

  async getUserIdByWebcalToken(token: string): Promise<string | null> {
    const tokenHash = CalendarCryptoService.hashFeedToken(token);
    const result = await queryDatabase<{ user_id: string }>(
      `SELECT user_id
       FROM webcal_tokens
       WHERE feed_token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    return result.rows[0]?.user_id ?? null;
  },

  async upsertExternalEvent(input: {
    userId: string;
    googleEventId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    sourceUpdatedAt: Date | null;
    rawPayload: Record<string, unknown>;
  }): Promise<void> {
    await queryDatabase(
      `INSERT INTO calendar_external_events (
         user_id,
         google_event_id,
         title,
         starts_at,
         ends_at,
         status,
         source_updated_at,
         raw_payload,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (user_id, google_event_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         status = EXCLUDED.status,
         source_updated_at = EXCLUDED.source_updated_at,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = NOW()`,
      [
        input.userId,
        input.googleEventId,
        input.title,
        input.startsAt,
        input.endsAt,
        input.status,
        input.sourceUpdatedAt,
        JSON.stringify(input.rawPayload),
      ],
    );
  },

  async deleteExternalEventByGoogleEventId(input: {
    userId: string;
    googleEventId: string;
  }): Promise<void> {
    await queryDatabase(
      `DELETE FROM calendar_external_events
       WHERE user_id = $1
         AND google_event_id = $2`,
      [input.userId, input.googleEventId],
    );
  },

  async listExternalEventsByUserAndRange(input: {
    userId: string;
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<
    Array<{
      googleEventId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      status: string;
      sourceUpdatedAt: string | null;
    }>
  > {
    const result = await queryDatabase<CalendarExternalEventRow>(
      `SELECT user_id,
              google_event_id,
              title,
              starts_at,
              ends_at,
              status,
              source_updated_at,
              raw_payload
       FROM calendar_external_events
       WHERE user_id = $1
         AND starts_at < $3
         AND ends_at > $2
       ORDER BY starts_at ASC`,
      [input.userId, input.rangeStart, input.rangeEnd],
    );

    return result.rows.map((row) => ({
      googleEventId: row.google_event_id,
      title: row.title,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      status: row.status,
      sourceUpdatedAt: row.source_updated_at ? row.source_updated_at.toISOString() : null,
    }));
  },
};
