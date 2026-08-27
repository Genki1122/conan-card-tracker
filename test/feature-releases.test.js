import assert from "node:assert/strict";
import test from "node:test";

import {
  MONTHLY_REPORT_RELEASE_AT,
  canAccessMonthlyReport,
  millisecondsUntilMonthlyReportRelease
} from "../src/feature-releases.js";

test("monthly report opens to everyone at 20:00 JST on August 30", () => {
  assert.equal(MONTHLY_REPORT_RELEASE_AT, "2026-08-30T20:00:00+09:00");
  assert.equal(canAccessMonthlyReport({
    now: new Date("2026-08-30T19:59:59+09:00"),
    role: ""
  }), false);
  assert.equal(canAccessMonthlyReport({
    now: new Date("2026-08-30T20:00:00+09:00"),
    role: ""
  }), true);
});

test("superadmin can review before release, but admin previews cannot edit or share", () => {
  const beforeRelease = new Date("2026-08-29T12:00:00+09:00");
  assert.equal(canAccessMonthlyReport({ now: beforeRelease, role: "superadmin" }), true);
  assert.equal(canAccessMonthlyReport({ now: beforeRelease, role: "superadmin", adminPreview: true }), false);
  assert.equal(canAccessMonthlyReport({ now: new Date("2026-08-31T12:00:00+09:00"), adminPreview: true }), false);
});

test("release delay reaches zero at the release time", () => {
  assert.equal(millisecondsUntilMonthlyReportRelease(new Date("2026-08-30T19:59:00+09:00")), 60_000);
  assert.equal(millisecondsUntilMonthlyReportRelease(new Date("2026-08-30T20:00:00+09:00")), 0);
});
