import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalChatReply,
  isConversationClosingMessage,
  resolveScheduleQueryWeekStart,
} from "./chat.utils.js";

test("isConversationClosingMessage matches common gratitude endings", () => {
  assert.equal(isConversationClosingMessage("thank you"), true);
  assert.equal(isConversationClosingMessage("תודה רבה!"), true);
  assert.equal(isConversationClosingMessage("לא תודה כרגע"), true);
});

test("isConversationClosingMessage ignores non-closing scheduling requests", () => {
  assert.equal(isConversationClosingMessage("אני לא יכול ביום רביעי"), false);
  assert.equal(isConversationClosingMessage("אפשר לשנות למשמרת בוקר?"), false);
});

test("getLocalChatReply answers greetings and help without model routing", () => {
  assert.match(getLocalChatReply("היי!") ?? "", /שיבוצים/);
  assert.match(getLocalChatReply("מה אפשר לעשות?") ?? "", /אל תשבץ אותי/);
});

test("getLocalChatReply only answers known cache hits and lets API handle the rest", () => {
  assert.equal(getLocalChatReply("ספר לי בדיחה"), null);
  assert.equal(getLocalChatReply("אני לא יכול ביום רביעי בערב"), null);
  assert.equal(getLocalChatReply("אל תשבץ אותי ביום ראשון בערב"), null);
});

test("resolveScheduleQueryWeekStart resolves current and next week schedule commands", () => {
  const now = new Date("2026-04-29T10:00:00+03:00");

  assert.equal(resolveScheduleQueryWeekStart("מה השיבוצים שלי לשבוע הקרוב?", now), "2026-04-26");
  assert.equal(resolveScheduleQueryWeekStart("מה השיבוצים שלי לשבוע הבא?", now), "2026-05-03");
  assert.equal(resolveScheduleQueryWeekStart("אילו שיבוצים קיימים לי השבוע?", now), "2026-04-26");
  assert.equal(resolveScheduleQueryWeekStart("איזה משמרות יש לי שבוע הבא?", now), "2026-05-03");
  assert.equal(resolveScheduleQueryWeekStart("אל תשבץ אותי ביום ראשון", now), null);
});
