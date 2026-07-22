import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stateSummary, statesEqual } from "../src/sync-state.js";

describe("cloud reconciliation helpers", () => {
  it("compares state without depending on object key order", () => {
    const local = { decks: [{ id: "deck-1", name: "鬼丸" }], sessions: [], matches: [] };
    const remote = { matches: [], sessions: [], decks: [{ name: "鬼丸", id: "deck-1" }] };
    assert.equal(statesEqual(local, remote), true);
    assert.equal(statesEqual(local, { ...remote, matches: [{ id: "match-1" }] }), false);
  });

  it("summarizes the records shown in the reconciliation choice", () => {
    assert.deepEqual(stateSummary({ decks: [{}], sessions: [{}, {}], matches: [{}, {}, {}] }), {
      decks: 1,
      sessions: 2,
      matches: 3
    });
    assert.deepEqual(stateSummary(), { decks: 0, sessions: 0, matches: 0 });
  });
});
