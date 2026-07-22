import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, removeLegacyMockState } from "../src/initial-state.js";

test("new users start without sample records", () => {
  assert.deepEqual(createInitialState(), {
    decks: [],
    sessions: [],
    environments: [],
    matches: []
  });
});

test("each new user state is independent", () => {
  const first = createInitialState();
  first.decks.push({ id: "deck-1" });

  assert.deepEqual(createInitialState().decks, []);
});

test("legacy mock-only state is cleared without touching mixed user data", () => {
  const legacyMock = {
    decks: [{ id: "deck-takagi" }, { id: "deck-conan" }],
    sessions: [{ id: "session-1" }, { id: "session-2" }],
    environments: ["未設定"],
    matches: [{ id: "match-1", sessionId: "session-1" }]
  };
  assert.deepEqual(removeLegacyMockState(legacyMock), createInitialState());

  const mixed = { ...legacyMock, decks: [...legacyMock.decks, { id: "my-deck" }] };
  assert.equal(removeLegacyMockState(mixed), mixed);
});
