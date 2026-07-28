import test from "node:test";
import assert from "node:assert/strict";

import {
  sessionVersionOptions,
  mergeStoreName,
  previewPlayerNameHonorificTrim,
  renameEnvironmentInState,
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

test("removes 'さん' and everything after it from all recorded player names", () => {
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

  assert.equal(result.affected, 2);
  assert.deepEqual(result.state.matches.map((match) => match.opponentPlayer), [
    "プレイヤーA",
    "プレイヤーA",
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
    affectedMatches: 4,
    affectedNames: 3,
    changes: [
      { from: "プレイヤーAさん入力中", to: "プレイヤーA", matches: 2 },
      { from: "プレイヤーAさん", to: "プレイヤーA", matches: 1 },
      { from: "プレイヤーBさん", to: "プレイヤーB", matches: 1 }
    ]
  });
  assert.equal(state.matches[0].opponentPlayer, "プレイヤーAさん入力中");
});
