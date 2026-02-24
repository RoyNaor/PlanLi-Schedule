import test from "node:test";
import assert from "node:assert/strict";
import { isConversationClosingMessage } from "./chat.utils.js";

test("isConversationClosingMessage matches common gratitude endings", () => {
  assert.equal(isConversationClosingMessage("thank you"), true);
  assert.equal(isConversationClosingMessage("תודה רבה!"), true);
  assert.equal(isConversationClosingMessage("לא תודה כרגע"), true);
});

test("isConversationClosingMessage ignores non-closing scheduling requests", () => {
  assert.equal(isConversationClosingMessage("אני לא יכול ביום רביעי"), false);
  assert.equal(isConversationClosingMessage("אפשר לשנות למשמרת בוקר?"), false);
});
