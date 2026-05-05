import { describe, expect, it } from "vitest";
import { buildCalendarFeedUrl } from "./calendar-sync.service";

describe("buildCalendarFeedUrl", () => {
  it("builds canonical feed url without duplicate slashes", () => {
    const url = buildCalendarFeedUrl("https://planli.app/", "abc123");
    expect(url).toBe("https://planli.app/api/calendar/feed/abc123.ics");
  });
});
