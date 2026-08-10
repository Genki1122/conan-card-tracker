import test from "node:test";
import assert from "node:assert/strict";

import {
  sessionVersionOptions,
  mergeStoreName,
  previewPlayerNameHonorificTrim,
  renameEnvironmentInState,
  resolveSessionCreatedAt,
  sortSessionsNewestFirst,
  trimPlayerNamesAtHonorific,
  updateSessionDeck
} from "../src/data-operations.js";

const baseState = {
  decks: [
    { id: "deck-a", name: "鬼丸剣道", version: "v1" },
    { id: "deck-b", name: "平次和葉", version: "v3" }
  ],
  sessions: [
    { id: "session-1", deckId: "deck-a", deckVersion: "v1", name: "店舗A", environment: "9弾環境" },
    { id: "session-2", deckId: "deck-a", deckVersion: "v1", name: "店舗A", environment: "9弾環境" }
  ],
  environments: ["9弾環境"],
  matches: [
    { id: "match-1", sessionId: "session-1", myDeck: "鬼丸剣道" },
    { id: "match-2", sessionId: "session-2", myDeck: "鬼丸剣道" }
  ]
};

test("changing a session deck also corrects its recorded matches", () => {
  const next = updateSessionDeck(baseState, {
    sessionId: "session-1",
    deckId: "deck-b",
    deckVersion: "新弾後"
  });

  assert.deepEqual(
    next.sessions.find((session) => session.id === "session-1"),
    { id: "session-1", deckId: "deck-b", deckVersion: "新弾後", name: "店舗A", environment: "9弾環境" }
  );
  assert.equal(next.matches.find((match) => match.id === "match-1").myDeck, "平次和葉");
  assert.equal(next.matches.find((match) => match.id === "match-2").myDeck, "鬼丸剣道");
});

test("merging a store name updates every matching session and reports the count", () => {
  const result = mergeStoreName(baseState, "店舗A", "LIG高田馬場");

  assert.equal(result.affected, 2);
  assert.deepEqual(result.state.sessions.map((session) => session.name), [
    "LIG高田馬場",
    "LIG高田馬場"
  ]);
});

test("renaming an environment updates sessions and removes duplicate master entries", () => {
  const state = {
    ...baseState,
    environments: ["9弾環境", "第9弾環境"]
  };
  const next = renameEnvironmentInState(state, "9弾環境", "第9弾環境");

  assert.deepEqual(next.environments, ["第9弾環境"]);
  assert.equal(next.sessions.every((session) => session.environment === "第9弾環境"), true);
});

test("provides stable session version choices without duplicates", () => {
  const state = {
    ...baseState,
    decks: [{ id: "deck-a", name: "鬼丸剣道", version: "v3" }],
    sessions: [
      { id: "session-1", deckId: "deck-a", deckVersion: "v1" },
      { id: "session-2", deckId: "deck-a", deckVersion: "v2" },
      { id: "session-3", deckId: "deck-a", deckVersion: "v2" }
    ]
  };

  assert.deepEqual(sessionVersionOptions(state, "deck-a", "大会用"), ["大会用", "v3", "v1", "v2"]);
});

test("keeps 'さん' and removes only the characters after it", () => {
  const state = {
    ...baseState,
    matches: [
      { id: "match-1", opponentPlayer: "プレイヤーAさん入力中" },
      { id: "match-2", opponentPlayer: "プレイヤーAさん" },
      { id: "match-3", opponentPlayer: "佐藤" },
      { id: "match-4", opponentPlayer: "不明" }
    ]
  };

  const result = trimPlayerNamesAtHonorific(state);

  assert.equal(result.affected, 1);
  assert.deepEqual(result.state.matches.map((match) => match.opponentPlayer), [
    "プレイヤーAさん",
    "プレイヤーAさん",
    "佐藤",
    "不明"
  ]);
});

test("previews every player-name change without modifying match records", () => {
  const state = {
    ...baseState,
    matches: [
      { id: "match-1", opponentPlayer: "プレイヤーAさん入力中" },
      { id: "match-2", opponentPlayer: "プレイヤーAさん入力中" },
      { id: "match-3", opponentPlayer: "プレイヤーAさん" },
      { id: "match-4", opponentPlayer: "プレイヤーBさん" },
      { id: "match-5", opponentPlayer: "プレイヤーC" }
    ]
  };

  const preview = previewPlayerNameHonorificTrim(state);

  assert.deepEqual(preview, {
    totalMatches: 5,
    affectedMatches: 2,
    affectedNames: 1,
    changes: [
      { from: "プレイヤーAさん入力中", to: "プレイヤーAさん", matches: 2 }
    ]
  });
  assert.equal(state.matches[0].opponentPlayer, "プレイヤーAさん入力中");
});

test("sorts sessions by event date and then by registration time", () => {
  const sessions = [
    { id: "morning", date: "2026-08-10", createdAt: "2026-08-10T01:00:00.000Z" },
    { id: "afternoon", date: "2026-08-10", createdAt: "2026-08-10T06:00:00.000Z" },
    { id: "next-day", date: "2026-08-11", createdAt: "2026-08-09T23:00:00.000Z" }
  ];

  const sorted = sortSessionsNewestFirst(sessions);

  assert.deepEqual(sorted.map((session) => session.id), ["next-day", "afternoon", "morning"]);
  assert.deepEqual(sessions.map((session) => session.id), ["morning", "afternoon", "next-day"]);
});

test("uses later array positions for legacy sessions registered on the same day", () => {
  const sessions = [
    { id: "store-a", date: "2026-08-10" },
    { id: "store-b", date: "2026-08-10" }
  ];

  assert.deepEqual(
    sortSessionsNewestFirst(sessions).map((session) => session.id),
    ["store-b", "store-a"]
  );
});

test("preserves registration time when editing and adds it only to new sessions", () => {
  const now = "2026-08-10T06:00:00.000Z";

  assert.equal(resolveSessionCreatedAt(null, now), now);
  assert.equal(
    resolveSessionCreatedAt({ createdAt: "2026-08-10T01:00:00.000Z" }, now),
    "2026-08-10T01:00:00.000Z"
  );
  assert.equal(resolveSessionCreatedAt({}, now), "");
});
