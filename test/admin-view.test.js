import test from "node:test";
import assert from "node:assert/strict";

import { beginAdminPreview, endAdminPreview } from "../src/admin-view.js";

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
