import test from "node:test";
import assert from "node:assert/strict";
import {
  getJerusalemTodayIsoDate,
  isDateInsideWeek,
  isIsoDateString,
  isTimeString,
  normalizeTimeToHourMinute,
} from "./schedule-date.utils.js";

test("isIsoDateString validates calendar dates", () => {
  assert.equal(isIsoDateString("2026-03-21"), true);
  assert.equal(isIsoDateString("2026-02-31"), false);
  assert.equal(isIsoDateString("21-03-2026"), false);
});

test("isTimeString validates 24-hour HH:mm values", () => {
  assert.equal(isTimeString("08:00"), true);
  assert.equal(isTimeString("08:00:00"), true);
  assert.equal(isTimeString("23:59"), true);
  assert.equal(isTimeString("24:00"), false);
  assert.equal(isTimeString("8:00"), false);
});

test("normalizeTimeToHourMinute normalizes supported values", () => {
  assert.equal(normalizeTimeToHourMinute("08:00"), "08:00");
  assert.equal(normalizeTimeToHourMinute("08:00:59"), "08:00");
  assert.equal(normalizeTimeToHourMinute("8:00"), null);
});

test("isDateInsideWeek accepts dates within the week window", () => {
  assert.equal(isDateInsideWeek("2026-03-22", "2026-03-22"), true);
  assert.equal(isDateInsideWeek("2026-03-22", "2026-03-28"), true);
  assert.equal(isDateInsideWeek("2026-03-22", "2026-03-29"), false);
  assert.equal(isDateInsideWeek("2026-03-22", "2026-03-21"), false);
});

test("getJerusalemTodayIsoDate formats date for Asia/Jerusalem", () => {
  const date = new Date("2026-03-21T22:30:00.000Z");
  assert.equal(getJerusalemTodayIsoDate(date), "2026-03-22");
});
