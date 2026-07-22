import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/initial-state.js";

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
