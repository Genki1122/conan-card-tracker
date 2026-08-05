import test from "node:test";
import assert from "node:assert/strict";

import {
  clearAuthChallenge,
  createAuthChallenge,
  isValidOtpCode,
  loadAuthChallenge,
  normalizeOtpCode,
  saveAuthChallenge
} from "../src/auth-challenge.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("persists an OTP challenge while the user checks their email", () => {
  const storage = memoryStorage();
  const challenge = createAuthChallenge({
    email: " user@example.com ",
    username: " コナン ",
    mode: "signup",
    termsVersion: "2026-07-23-v2",
    now: 1_000
  });

  saveAuthChallenge(storage, challenge);

  assert.deepEqual(loadAuthChallenge(storage, 2_000), {
    email: "user@example.com",
    username: "コナン",
    mode: "signup",
    termsVersion: "2026-07-23-v2",
    sentAt: 1_000
  });
});

test("expires an abandoned OTP challenge after one hour", () => {
  const storage = memoryStorage();
  saveAuthChallenge(storage, createAuthChallenge({
    email: "user@example.com",
    mode: "login",
    now: 1_000
  }));

  assert.equal(loadAuthChallenge(storage, 1_000 + 60 * 60 * 1000 + 1), null);
  assert.equal(loadAuthChallenge(storage, 1_000 + 60 * 60 * 1000 + 2), null);
});

test("clears an OTP challenge after login or cancellation", () => {
  const storage = memoryStorage();
  saveAuthChallenge(storage, createAuthChallenge({ email: "user@example.com", mode: "login" }));

  clearAuthChallenge(storage);

  assert.equal(loadAuthChallenge(storage), null);
});

test("normalizes pasted email codes without truncating configured digits", () => {
  assert.equal(normalizeOtpCode("１２３４ ５６７８"), "12345678");
  assert.equal(normalizeOtpCode("code: 123-456"), "123456");
  assert.equal(normalizeOtpCode("1234567890"), "1234567890");
});

test("accepts every OTP length supported by Supabase", () => {
  assert.equal(isValidOtpCode("123456"), true);
  assert.equal(isValidOtpCode("12345678"), true);
  assert.equal(isValidOtpCode("1234567890"), true);
  assert.equal(isValidOtpCode("12345"), false);
  assert.equal(isValidOtpCode("12345678901"), false);
});
