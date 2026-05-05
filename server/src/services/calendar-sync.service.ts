import { randomUUID } from "node:crypto";
import { queryDatabase } from "./database.service.js";
import { CalendarIntegrationService } from "./calendar-integration.service.js";
import { GoogleTokenService } from "./google-token.service.js";
import {
  GoogleCalendarClient,
  type GoogleCalendarEvent,
} from "./google-calendar.client.js";
import { IcsFeedService } from "./ics-feed.service.js";
import { buildShiftDateTimesUtc } from "./calendar-time.util.js";

interface PublishedAssignmentRow {
  schedule_version_id: string;
  week_start: string;
  shift_id: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  user_role: string;
  source: "solver" | "manual";
}

interface GoogleEventPayload {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: {
    private: Record<string, string>;
  };
}

function getWebhookUrl(): string {
  const value = process.env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
  if (!value) {
    throw new Error("GOOGLE_CALENDAR_WEBHOOK_URL is not configured");
  }
  return value;
}

function getWebcalBaseUrl(): string {
  const value = process.env.WEBCAL_BASE_URL?.trim();
  if (!value) {
    throw new Error("WEBCAL_BASE_URL is not configured");
  }
  return value.replace(/\/+$/, "");
}

function toGoogleEventPayload(assignment: PublishedAssignmentRow): GoogleEventPayload {
  const dateTimes = buildShiftDateTimesUtc({
    shiftDate: assignment.shift_date,
    startTime: assignment.start_time,
    endTime: assignment.end_time,
  });

  const privateProperties = {
    appSource: "planli_db",
    userId: assignment.user_id,
    weekStart: assignment.week_start,
    versionId: assignment.schedule_version_id,
    shiftId: String(assignment.shift_id),
  };

  return {
    summary: "PlanLi Shift",
    description: `PlanLi schedule for ${assignment.user_full_name} (${assignment.user_role})`,
    start: {
      dateTime: dateTimes.startsAtIso,
      timeZone: "UTC",
    },
    end: {
      dateTime: dateTimes.endsAtIso,
      timeZone: "UTC",
    },
    extendedProperties: {
      private: privateProperties,
    },
  };
}

function parseGoogleEventDateTime(
  eventDateTime: { dateTime?: string; date?: string } | undefined,
): Date | null {
  if (!eventDateTime) return null;
  if (eventDateTime.dateTime) {
    const parsed = new Date(eventDateTime.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (eventDateTime.date) {
    const parsed = new Date(`${eventDateTime.date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isPlanliEvent(event: GoogleCalendarEvent): boolean {
  return event.extendedProperties?.private?.appSource === "planli_db";
}

function mapAssignmentKey(input: {
  scheduleVersionId: string;
  shiftId: number;
}): string {
  return `${input.scheduleVersionId}:${input.shiftId}`;
}

export const CalendarSyncService = {
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    channelExpiration: string | null;
    lastSyncAt: string | null;
    webcalUrl: string | null;
  }> {
    const integration = await CalendarIntegrationService.getGoogleIntegrationByUserId(userId);
    const feedToken =
      (await CalendarIntegrationService.getWebcalTokenByUserId(userId)) ??
      (await CalendarIntegrationService.rotateWebcalToken(userId));

    return {
      connected: Boolean(integration),
      channelExpiration: integration?.channelExpiration
        ? integration.channelExpiration.toISOString()
        : null,
      lastSyncAt: integration?.lastSyncAt ? integration.lastSyncAt.toISOString() : null,
      webcalUrl: `${getWebcalBaseUrl()}/api/calendar/feed/${feedToken}.ics`,
    };
  },

  async ensureWebcalToken(userId: string): Promise<string> {
    return (
      (await CalendarIntegrationService.getWebcalTokenByUserId(userId)) ??
      (await CalendarIntegrationService.rotateWebcalToken(userId))
    );
  },

  async registerWatchChannel(userId: string): Promise<void> {
    await GoogleTokenService.withValidAccessToken(userId, async (accessToken) => {
      const channelId = randomUUID();
      const watch = await GoogleCalendarClient.watchPrimaryCalendar({
        accessToken,
        channelId,
        webhookAddress: getWebhookUrl(),
      });

      await CalendarIntegrationService.updateWatchChannel({
        userId,
        channelId: watch.id,
        resourceId: watch.resourceId,
        channelExpiration: watch.expiration ? new Date(Number(watch.expiration)) : null,
      });
    });
  },

  async disconnectUser(userId: string): Promise<void> {
    const integration = await CalendarIntegrationService.getGoogleIntegrationByUserId(userId);
    if (integration?.channelId && integration.resourceId) {
      await GoogleTokenService.withValidAccessToken(userId, async (accessToken) => {
        await GoogleCalendarClient.stopChannel({
          accessToken,
          channelId: integration.channelId as string,
          resourceId: integration.resourceId as string,
        });
      }).catch(() => undefined);
    }

    await CalendarIntegrationService.clearWatchChannel(userId);
    await CalendarIntegrationService.deleteGoogleIntegration(userId);
  },

  async syncPublishedVersion(versionId: string): Promise<void> {
    const assignments = await queryDatabase<PublishedAssignmentRow>(
      `SELECT sa.schedule_version_id,
              sv.week_start::text AS week_start,
              sa.shift_id,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              sa.user_id,
              u.email AS user_email,
              u.full_name AS user_full_name,
              u.role AS user_role,
              sa.source
       FROM schedule_assignments sa
       INNER JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
       INNER JOIN shifts s ON s.id = sa.shift_id
       INNER JOIN users u ON u.id = sa.user_id
       WHERE sa.schedule_version_id = $1
       ORDER BY sa.user_id, s.shift_date, s.start_time`,
      [versionId],
    );

    if (!assignments.rows.length) return;
    const weekStart = assignments.rows[0].week_start;
    const assignmentsByUser = new Map<string, PublishedAssignmentRow[]>();
    for (const row of assignments.rows) {
      if (!assignmentsByUser.has(row.user_id)) {
        assignmentsByUser.set(row.user_id, []);
      }
      assignmentsByUser.get(row.user_id)?.push(row);
    }

    await Promise.all(
      [...assignmentsByUser.entries()].map(async ([userId, rows]) => {
        const integration = await CalendarIntegrationService.getGoogleIntegrationByUserId(userId);
        if (!integration) return;

        const existingLinks = await CalendarIntegrationService.listEventLinksByWeek({
          userId,
          weekStart,
        });
        const wantedKeys = new Set(
          rows.map((row) =>
            mapAssignmentKey({
              scheduleVersionId: row.schedule_version_id,
              shiftId: row.shift_id,
            }),
          ),
        );

        await GoogleTokenService.withValidAccessToken(userId, async (accessToken) => {
          for (const link of existingLinks) {
            const existingKey = mapAssignmentKey({
              scheduleVersionId: link.scheduleVersionId,
              shiftId: link.shiftId,
            });
            if (wantedKeys.has(existingKey)) continue;

            await GoogleCalendarClient.deleteEvent({
              accessToken,
              eventId: link.googleEventId,
            }).catch(() => undefined);

            await CalendarIntegrationService.deleteEventLink({
              userId,
              scheduleVersionId: link.scheduleVersionId,
              shiftId: link.shiftId,
            });
          }

          for (const row of rows) {
            const payload = toGoogleEventPayload(row);
            const existingLink = await CalendarIntegrationService.getEventLink({
              userId,
              scheduleVersionId: row.schedule_version_id,
              shiftId: row.shift_id,
            });

            if (existingLink) {
              const patched = await GoogleCalendarClient.patchEvent({
                accessToken,
                eventId: existingLink.googleEventId,
                event: payload as unknown as Record<string, unknown>,
              });
              await CalendarIntegrationService.upsertEventLink({
                userId,
                weekStart,
                scheduleVersionId: row.schedule_version_id,
                shiftId: row.shift_id,
                googleEventId: patched.id,
                etag: patched.etag ?? null,
              });
              continue;
            }

            const created = await GoogleCalendarClient.insertEvent({
              accessToken,
              event: payload as unknown as Record<string, unknown>,
            });
            await CalendarIntegrationService.upsertEventLink({
              userId,
              weekStart,
              scheduleVersionId: row.schedule_version_id,
              shiftId: row.shift_id,
              googleEventId: created.id,
              etag: created.etag ?? null,
            });
          }
        });
      }),
    );
  },

  async syncSingleAssignment(input: {
    versionId: string;
    shiftId: number;
    userId: string;
    action: "upsert" | "delete";
  }): Promise<void> {
    const versionResult = await queryDatabase<{ week_start: string; is_published: boolean }>(
      `SELECT week_start::text AS week_start, is_published
       FROM schedule_versions
       WHERE id = $1`,
      [input.versionId],
    );
    const version = versionResult.rows[0];
    if (!version || !version.is_published) return;

    const integration = await CalendarIntegrationService.getGoogleIntegrationByUserId(input.userId);
    if (!integration) return;

    await GoogleTokenService.withValidAccessToken(input.userId, async (accessToken) => {
      if (input.action === "delete") {
        const link = await CalendarIntegrationService.getEventLink({
          userId: input.userId,
          scheduleVersionId: input.versionId,
          shiftId: input.shiftId,
        });
        if (!link) return;

        await GoogleCalendarClient.deleteEvent({
          accessToken,
          eventId: link.googleEventId,
        }).catch(() => undefined);
        await CalendarIntegrationService.deleteEventLink({
          userId: input.userId,
          scheduleVersionId: input.versionId,
          shiftId: input.shiftId,
        });
        return;
      }

      const assignmentResult = await queryDatabase<PublishedAssignmentRow>(
        `SELECT sa.schedule_version_id,
                sv.week_start::text AS week_start,
                sa.shift_id,
                s.shift_date::text AS shift_date,
                s.start_time,
                s.end_time,
                sa.user_id,
                u.email AS user_email,
                u.full_name AS user_full_name,
                u.role AS user_role,
                sa.source
         FROM schedule_assignments sa
         INNER JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
         INNER JOIN shifts s ON s.id = sa.shift_id
         INNER JOIN users u ON u.id = sa.user_id
         WHERE sa.schedule_version_id = $1
           AND sa.shift_id = $2
           AND sa.user_id = $3
         LIMIT 1`,
        [input.versionId, input.shiftId, input.userId],
      );
      const assignment = assignmentResult.rows[0];
      if (!assignment) return;

      const payload = toGoogleEventPayload(assignment);
      const link = await CalendarIntegrationService.getEventLink({
        userId: assignment.user_id,
        scheduleVersionId: assignment.schedule_version_id,
        shiftId: assignment.shift_id,
      });

      if (link) {
        const patched = await GoogleCalendarClient.patchEvent({
          accessToken,
          eventId: link.googleEventId,
          event: payload as unknown as Record<string, unknown>,
        });
        await CalendarIntegrationService.upsertEventLink({
          userId: assignment.user_id,
          weekStart: assignment.week_start,
          scheduleVersionId: assignment.schedule_version_id,
          shiftId: assignment.shift_id,
          googleEventId: patched.id,
          etag: patched.etag ?? null,
        });
        return;
      }

      const created = await GoogleCalendarClient.insertEvent({
        accessToken,
        event: payload as unknown as Record<string, unknown>,
      });
      await CalendarIntegrationService.upsertEventLink({
        userId: assignment.user_id,
        weekStart: assignment.week_start,
        scheduleVersionId: assignment.schedule_version_id,
        shiftId: assignment.shift_id,
        googleEventId: created.id,
        etag: created.etag ?? null,
      });
    });
  },

  async handleWebhook(headers: {
    channelId: string;
    resourceId: string;
    resourceState: string;
  }): Promise<void> {
    if (headers.resourceState === "sync") {
      return;
    }

    const integration = await CalendarIntegrationService.getGoogleIntegrationByChannel({
      channelId: headers.channelId,
      resourceId: headers.resourceId,
    });
    if (!integration) {
      throw new Error("Webhook channel is not recognized");
    }

    await GoogleTokenService.withValidAccessToken(integration.userId, async (accessToken) => {
      const delta = await GoogleCalendarClient.listEventsIncremental({
        accessToken,
        syncToken: integration.syncToken,
      });

      for (const event of delta.events) {
        if (!event.id) continue;
        if (isPlanliEvent(event)) continue;

        if (event.status === "cancelled") {
          await CalendarIntegrationService.deleteExternalEventByGoogleEventId({
            userId: integration.userId,
            googleEventId: event.id,
          });
          await CalendarIntegrationService.deleteEventLinkByGoogleEventId({
            userId: integration.userId,
            googleEventId: event.id,
          });
          continue;
        }

        const start = parseGoogleEventDateTime(event.start);
        const end = parseGoogleEventDateTime(event.end);
        if (!start || !end) continue;

        await CalendarIntegrationService.upsertExternalEvent({
          userId: integration.userId,
          googleEventId: event.id,
          title: event.summary ?? "Google Calendar Event",
          startsAt: start,
          endsAt: end,
          status: event.status ?? "confirmed",
          sourceUpdatedAt: event.updated ? new Date(event.updated) : null,
          rawPayload: event as unknown as Record<string, unknown>,
        });
      }

      await CalendarIntegrationService.updateSyncToken({
        userId: integration.userId,
        syncToken: delta.nextSyncToken,
      });
    });
  },

  async renewExpiringChannels(withinHours: number): Promise<{
    checked: number;
    renewed: number;
  }> {
    const expiring = await CalendarIntegrationService.listExpiringChannels(withinHours);
    let renewed = 0;

    for (const integration of expiring) {
      await GoogleTokenService.withValidAccessToken(integration.userId, async (accessToken) => {
        if (integration.channelId && integration.resourceId) {
          await GoogleCalendarClient.stopChannel({
            accessToken,
            channelId: integration.channelId,
            resourceId: integration.resourceId,
          }).catch(() => undefined);
        }

        const watch = await GoogleCalendarClient.watchPrimaryCalendar({
          accessToken,
          channelId: randomUUID(),
          webhookAddress: getWebhookUrl(),
        });

        await CalendarIntegrationService.updateWatchChannel({
          userId: integration.userId,
          channelId: watch.id,
          resourceId: watch.resourceId,
          channelExpiration: watch.expiration ? new Date(Number(watch.expiration)) : null,
        });
      });
      renewed += 1;
    }

    return {
      checked: expiring.length,
      renewed,
    };
  },

  async buildIcsFeedForToken(token: string): Promise<string> {
    const userId = await CalendarIntegrationService.getUserIdByWebcalToken(token);
    if (!userId) {
      throw new Error("Calendar feed token is invalid");
    }

    const assignmentsResult = await queryDatabase<{
      schedule_version_id: string;
      version_number: number;
      shift_id: number;
      shift_date: string;
      start_time: string;
      end_time: string;
      user_id: string;
      user_email: string;
      user_full_name: string;
      user_role: string;
      source: "solver" | "manual";
    }>(
      `SELECT sa.schedule_version_id,
              sv.version_number,
              sa.shift_id,
              s.shift_date::text AS shift_date,
              s.start_time,
              s.end_time,
              sa.user_id,
              u.email AS user_email,
              u.full_name AS user_full_name,
              u.role AS user_role,
              sa.source
       FROM schedule_assignments sa
       INNER JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
       INNER JOIN shifts s ON s.id = sa.shift_id
       INNER JOIN users u ON u.id = sa.user_id
       WHERE sa.user_id = $1
         AND sv.is_published = TRUE
       ORDER BY s.shift_date ASC, s.start_time ASC`,
      [userId],
    );

    const events = assignmentsResult.rows.map((row) =>
      IcsFeedService.buildPlanliEventFromAssignment(
        {
          shiftId: row.shift_id,
          shiftDate: row.shift_date,
          startTime: row.start_time,
          endTime: row.end_time,
          userId: row.user_id,
          userEmail: row.user_email,
          userFullName: row.user_full_name,
          userRole: row.user_role,
          source: row.source,
        },
        row.version_number,
      ),
    );

    return IcsFeedService.buildCalendarFeed({
      events,
      calendarName: "PlanLi Schedule",
    });
  },
};
