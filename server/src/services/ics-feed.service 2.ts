import type { ScheduleAssignmentView } from "./schedule.service.js";
import { buildShiftDateTimesUtc } from "./calendar-time.util.js";

interface IcsEventInput {
  uid: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  description?: string;
}

function toIcsUtcDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime for ICS: ${isoDateTime}`);
  }

  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export const IcsFeedService = {
  buildPlanliEventFromAssignment(
    assignment: ScheduleAssignmentView,
    versionNumber: number,
  ): IcsEventInput {
    const dateTimes = buildShiftDateTimesUtc({
      shiftDate: assignment.shiftDate,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
    });

    return {
      uid: `planli-${assignment.userId}-${assignment.shiftId}-${versionNumber}`,
      title: `PlanLi Shift`,
      startsAtIso: dateTimes.startsAtIso,
      endsAtIso: dateTimes.endsAtIso,
      description: `Source: PlanLi\\nRole: ${assignment.userRole}\\nType: ${assignment.source}`,
    };
  },

  buildCalendarFeed(input: {
    events: IcsEventInput[];
    calendarName?: string;
  }): string {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PlanLi//Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcsText(input.calendarName ?? "PlanLi Schedule")}`,
    ];

    const nowStamp = toIcsUtcDateTime(new Date().toISOString());

    for (const event of input.events) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${escapeIcsText(event.uid)}`);
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART:${toIcsUtcDateTime(event.startsAtIso)}`);
      lines.push(`DTEND:${toIcsUtcDateTime(event.endsAtIso)}`);
      lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
      }
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return `${lines.join("\r\n")}\r\n`;
  },
};
