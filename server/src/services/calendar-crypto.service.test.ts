import test from "node:test";
import assert from "node:assert/strict";
import { CalendarCryptoService } from "./calendar-crypto.service.js";

test("CalendarCryptoService encrypt/decrypt round trip", () => {
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=";
  const secret = "refresh-token-value";

  const encrypted = CalendarCryptoService.encrypt(secret);
  assert.notEqual(encrypted, secret);

  const decrypted = CalendarCryptoService.decrypt(encrypted);
  assert.equal(decrypted, secret);
});

test("CalendarCryptoService hashFeedToken returns stable hash", () => {
  const first = CalendarCryptoService.hashFeedToken("abc");
  const second = CalendarCryptoService.hashFeedToken("abc");
  const third = CalendarCryptoService.hashFeedToken("xyz");

  assert.equal(first, second);
  assert.notEqual(first, third);
});
