import test from "node:test";
import assert from "node:assert/strict";
import { GoogleOAuthService } from "./google-oauth.service.js";

test("GoogleOAuthService creates and verifies signed OAuth state", () => {
  process.env.GOOGLE_CALENDAR_STATE_SECRET = "unit-test-state-secret";

  const state = GoogleOAuthService.createOAuthState("user-123");
  const parsed = GoogleOAuthService.verifyOAuthState(state);

  assert.equal(parsed.userId, "user-123");
});

test("GoogleOAuthService rejects tampered OAuth state", () => {
  process.env.GOOGLE_CALENDAR_STATE_SECRET = "unit-test-state-secret";
  const state = GoogleOAuthService.createOAuthState("user-123");
  const tampered = `${state}tamper`;

  assert.throws(() => GoogleOAuthService.verifyOAuthState(tampered));
});
