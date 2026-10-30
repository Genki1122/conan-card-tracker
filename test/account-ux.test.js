import assert from "node:assert/strict";
import test from "node:test";
import { logoutBlockReason, syncGuidance, syncRetryAction } from "../src/account-ux.js";

test("logout requires a signed-in, clean and idle account", () => {
  assert.equal(logoutBlockReason({ signedIn: true }), "");
  for (const flags of [{}, { signedIn: true, dirty: true }, { signedIn: true, busy: true }, { signedIn: true, conflict: true }]) {
    assert.ok(logoutBlockReason(flags));
  }
  assert.match(logoutBlockReason({ signedIn: true, dirty: true }), /未同期/);
  assert.match(logoutBlockReason({ signedIn: true, conflict: true }), /異なる/);
});

test("sync retry never force-writes or overwrites a conflict", () => {
  assert.equal(syncRetryAction({ online: false, dirty: true }), "offline");
  assert.equal(syncRetryAction({ online: true, busy: true }), "busy");
  assert.equal(syncRetryAction({ online: true, dirty: true, updatedAt: "date" }), "save");
  assert.equal(syncRetryAction({ online: true, dirty: true }), "check");
  assert.equal(syncRetryAction({ online: true, dirty: true, conflict: true, updatedAt: "date" }), "check");
  assert.equal(syncRetryAction({ online: true }), "check");
});

test("sync guidance distinguishes offline, unsynced, conflicts and confirmed saves", () => {
  assert.match(syncGuidance({ online: false }).title, /オフライン/);
  assert.match(syncGuidance({ online: true, conflict: true }).detail, /上書き/);
  assert.match(syncGuidance({ online: true, dirty: true }).title, /未同期/);
  assert.match(syncGuidance({ online: true, busy: true }).title, /確認中/);
  assert.match(syncGuidance({ online: true, error: true, confirmedAt: "2026-10-30T00:00:00Z" }).title, /確認できません/);
  assert.match(syncGuidance({ online: true }).title, /未確認/);
  assert.match(syncGuidance({ online: true, confirmedAt: "2026-10-30T00:00:00Z" }).title, /同期済み/);
});
