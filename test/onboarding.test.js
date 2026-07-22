import test from "node:test";
import assert from "node:assert/strict";

import {
  accountOnboardingIntent,
  authRedirectUrl,
  clearAccountOnboardingUrl
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
