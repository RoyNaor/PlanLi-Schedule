import "dotenv/config";
import { CalendarSyncService } from "../src/services/calendar-sync.service.js";

async function main() {
  const withinHoursRaw = process.env.CALENDAR_CHANNEL_RENEWAL_WINDOW_HOURS;
  const withinHours = Number(withinHoursRaw ?? 48);
  const safeWindow = Number.isFinite(withinHours) && withinHours > 0 ? Math.floor(withinHours) : 48;

  const result = await CalendarSyncService.renewExpiringChannels(safeWindow);
  console.log(
    `[calendar:renew-channels] checked=${result.checked} renewed=${result.renewed} window_hours=${safeWindow}`,
  );
}

void main().catch((error) => {
  console.error("[calendar:renew-channels] failed", error);
  process.exitCode = 1;
});
