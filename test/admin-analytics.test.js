import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminOverview, buildAiTrainingDataset } from "../src/admin-analytics.js";

const input = {
  profiles: [
    { user_id: "u1", username: "コナン太郎", created_at: "2026-07-01T00:00:00Z" },
    { user_id: "u2", username: "平次", created_at: "2026-06-01T00:00:00Z" }
  ],
  consents: [
    { user_id: "u1", terms_version: "2026-07-22", accepted_at: "2026-07-01T00:00:00Z" }
  ],
  states: [
    {
      user_id: "u1",
      updated_at: "2026-07-20T00:00:00Z",
      data: {
        decks: [{ id: "d1", name: "鬼丸剣道" }],
        sessions: [{ id: "s1", deckId: "d1", environment: "9弾環境" }],
        matches: [
          { sessionId: "s1", myDeck: "鬼丸剣道", opponentDeck: "婚活警視庁", opponentPlayer: "秘密", result: "win", memo: "個人メモ" },
          { sessionId: "s1", myDeck: "鬼丸剣道", opponentDeck: "婚活警視庁", opponentPlayer: "秘密", result: "loss", memo: "個人メモ" }
        ]
      }
    },
    {
      user_id: "u2",
      updated_at: "2026-05-01T00:00:00Z",
      data: { decks: [], sessions: [], matches: [] }
    }
  ]
};

test("admin overview summarizes users and card-game activity", () => {
  const overview = buildAdminOverview(input, new Date("2026-07-22T00:00:00Z"));

  assert.equal(overview.users, 2);
  assert.equal(overview.activeUsers30d, 1);
  assert.equal(overview.decks, 1);
  assert.equal(overview.sessions, 1);
  assert.equal(overview.matches, 2);
  assert.equal(overview.winRate, 50);
  assert.equal(overview.aiEligibleUsers, 1);
  assert.equal(overview.userRows[0].username, "コナン太郎");
  assert.deepEqual(overview.opponentDecks[0], { name: "婚活警視庁", total: 2, wins: 1, winRate: 50 });
});

test("AI dataset excludes identities and free-form notes", () => {
  const dataset = buildAiTrainingDataset(input);

  assert.equal(dataset.length, 2);
  assert.deepEqual(Object.keys(dataset[0]).sort(), ["environment", "firstPlayer", "myDeck", "myPassed", "opponentDeck", "opponentPassed", "opponentRps", "result"].sort());
  assert.equal(JSON.stringify(dataset).includes("秘密"), false);
  assert.equal(JSON.stringify(dataset).includes("個人メモ"), false);
  assert.equal(dataset.some((row) => row.myDeck === "鬼丸剣道"), true);
});

test("registered users remain visible before creating their first record", () => {
  const overview = buildAdminOverview({
    profiles: [{ user_id: "new-user", username: "新規ユーザー" }],
    consents: [],
    states: []
  }, new Date("2026-07-22T00:00:00Z"));

  assert.equal(overview.userRows.length, 1);
  assert.deepEqual(overview.userRows[0], {
    userId: "new-user",
    username: "新規ユーザー",
    decks: 0,
    sessions: 0,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    lastUpdated: "",
    consented: false
  });
});
