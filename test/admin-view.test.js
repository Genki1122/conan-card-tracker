import test from "node:test";
import assert from "node:assert/strict";

import {
  adminAccountDeletionState,
  beginAdminPreview,
  duplicateAdminUsers,
  endAdminPreview
} from "../src/admin-view.js";

test("admin preview preserves the administrator state and exposes the selected user state", () => {
  const ownState = { decks: [{ id: "admin-deck" }], sessions: [], environments: [], matches: [] };
  const remote = {
    data: { decks: [{ id: "user-deck" }], sessions: [], environments: [], matches: [] },
    updated_at: "2026-07-23T00:00:00Z"
  };

  const preview = beginAdminPreview(ownState, { userId: "u2", username: "平次" }, remote);

  assert.equal(preview.userId, "u2");
  assert.equal(preview.username, "平次");
  assert.equal(preview.updatedAt, remote.updated_at);
  assert.equal(preview.ownState, ownState);
  assert.equal(preview.viewedState, remote.data);
  assert.equal(endAdminPreview(preview), ownState);
});

test("admin preview uses an empty state when the selected user has no cloud record", () => {
  const preview = beginAdminPreview(
    { decks: [], sessions: [], environments: [], matches: [] },
    { userId: "new-user", username: "新規ユーザー" },
    null
  );

  assert.deepEqual(preview.viewedState, {
    decks: [],
    sessions: [],
    environments: [],
    matches: []
  });
});

test("duplicate account candidates require the same normalized username", () => {
  const rows = [
    { userId: "u1", username: " コナン ", createdAt: "2026-08-01" },
    { userId: "u2", username: "コナン", createdAt: "2026-08-02" },
    { userId: "u3", username: "こなん", createdAt: "2026-08-03" },
    { userId: "u4", username: "平次", createdAt: "2026-08-04" }
  ];

  assert.deepEqual(duplicateAdminUsers(rows, "u1").map((row) => row.userId), ["u2"]);
});

test("only an empty non-admin duplicate can be deleted", () => {
  const target = {
    userId: "empty-user",
    username: "コナン",
    decks: 0,
    storedSessions: 0,
    storedMatches: 0,
    recovery: { active: false, decks: 0, sessions: 0, matches: 0 }
  };
  const retained = { userId: "kept-user", username: "コナン" };

  assert.deepEqual(adminAccountDeletionState({
    target,
    retained,
    currentUserId: "admin",
    confirmationUsername: "コナン"
  }), { allowed: true, reason: "" });

  assert.equal(adminAccountDeletionState({
    target: { ...target, storedMatches: 1 },
    retained,
    currentUserId: "admin",
    confirmationUsername: "コナン"
  }).reason, "記録があるアカウントは削除できません");

  assert.equal(adminAccountDeletionState({
    target: { ...target, userId: "admin" },
    retained,
    currentUserId: "admin",
    confirmationUsername: "コナン"
  }).reason, "管理者本人は削除できません");

  assert.equal(adminAccountDeletionState({
    target,
    retained: { userId: "other", username: "平次" },
    currentUserId: "admin",
    confirmationUsername: "コナン"
  }).reason, "残すアカウントを確認してください");
});
