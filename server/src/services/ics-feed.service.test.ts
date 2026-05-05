import test from "node:test";
import assert from "node:assert/strict";
import { IcsFeedService } from "./ics-feed.service.js";

test("IcsFeedService builds RFC5545-like VCALENDAR", () => {
  const feed = IcsFeedService.buildCalendarFeed({
    calendarName: "PlanLi Test",
    events: [
      {
        uid: "uid-1",
        title: "Project Meeting",
        startsAtIso: "2026-05-10T10:00:00Z",
        endsAtIso: "2026-05-10T11:00:00Z",
        description: "Weekly sync",
      },
    ],
  });

  assert.match(feed, /BEGIN:VCALENDAR/);
  assert.match(feed, /VERSION:2.0/);
  assert.match(feed, /BEGIN:VEVENT/);
  assert.match(feed, /UID:uid-1/);
  assert.match(feed, /SUMMARY:Project Meeting/);
  assert.match(feed, /END:VEVENT/);
  assert.match(feed, /END:VCALENDAR/);
});
