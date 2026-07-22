import test from "node:test";
import assert from "node:assert/strict";

import {
  accountOnboardingIntent,
  authRedirectUrl,
  clearAccountOnboardingUrl,
  normalizeUsername,
  validateUsername
} from "../src/onboarding.js";

test("account onboarding links open the account flow", () => {
  assert.equal(accountOnboardingIntent("?start=account"), true);
  assert.equal(accountOnboardingIntent("?start=deck"), false);
  assert.equal(accountOnboardingIntent(""), false);
});

test("account onboarding parameter is removed after it is consumed", () => {
  assert.equal(
    clearAccountOnboardingUrl("https://example.com/conan-card-tracker/?start=account&from=guide#top"),
    "/conan-card-tracker/?from=guide#top"
  );
});

test("authentication returns to the app without reopening onboarding", () => {
  assert.equal(
    authRedirectUrl("https://example.com/conan-card-tracker/?start=account&from=guide#top"),
    "https://example.com/conan-card-tracker/?from=guide"
  );
});

test("usernames are normalized and validated", () => {
  assert.equal(normalizeUsername("  コナン 太郎  "), "コナン 太郎");
  assert.equal(validateUsername("コナン太郎"), "");
  assert.equal(validateUsername("a"), "ユーザー名は2〜20文字で入力してください");
  assert.equal(validateUsername("管理者<>"), "ユーザー名に使用できない文字が含まれています");
});
