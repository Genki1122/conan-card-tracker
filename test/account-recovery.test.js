import test from "node:test";
import assert from "node:assert/strict";

import {
  hasAccountRecords,
  mergeAccountStates,
  recoverySummary
} from "../src/account-recovery.js";

function state(overrides = {}) {
  return {
    decks: [],
    sessions: [],
    environments: [],
    matches: [],
    ...overrides
  };
}

test("detects whether an anonymous state contains user records", () => {
  assert.equal(hasAccountRecords(state()), false);
  assert.equal(hasAccountRecords(state({ matches: [{ id: "m1" }] })), true);
  assert.equal(hasAccountRecords(state({ environments: ["9弾環境"] })), false);
});

test("summarizes records without counting environment master values", () => {
  assert.deepEqual(recoverySummary(state({
    decks: [{ id: "d1" }],
    sessions: [{ id: "s1" }, { id: "s2" }],
    environments: ["9弾環境"],
    matches: [{ id: "m1" }, { id: "m2" }, { id: "m3" }]
  })), {
    decks: 1,
    sessions: 2,
    matches: 3
  });
});

test("merges exact IDs once and fills missing fields from anonymous data", () => {
  const account = state({
    decks: [{ id: "d1", name: "鬼丸剣道", version: "v1", partnerColor: "" }],
    sessions: [{ id: "s1", deckId: "d1", name: "店舗A", date: "2026-07-20", environment: "" }],
    matches: [{ id: "m1", sessionId: "s1", opponentDeck: "不明", result: "win" }]
  });
  const anonymous = state({
    decks: [{ id: "d1", name: "鬼丸剣道", version: "v1", partnerColor: "green" }],
    sessions: [{ id: "s1", deckId: "d1", name: "店舗A", date: "2026-07-20", environment: "9弾環境" }],
    matches: [{ id: "m1", sessionId: "s1", opponentDeck: "青単", result: "win" }]
  });

  const result = mergeAccountStates(account, anonymous);

  assert.equal(result.state.decks.length, 1);
  assert.equal(result.state.decks[0].partnerColor, "green");
  assert.equal(result.state.sessions[0].environment, "9弾環境");
  assert.equal(result.state.matches[0].opponentDeck, "青単");
  assert.deepEqual(result.added, { decks: 0, sessions: 0, matches: 0 });
});

test("keeps ambiguous different IDs and reports them for confirmation", () => {
  const account = state({
    decks: [{ id: "account-deck", name: "鬼丸剣道", version: "v1" }],
    sessions: [{
      id: "account-session",
      deckId: "account-deck",
      name: "LIG高田馬場",
      date: "2026-07-20",
      format: "BO1",
      environment: "9弾環境"
    }]
  });
  const anonymous = state({
    decks: [{ id: "anonymous-deck", name: "鬼丸剣道", version: "v1" }],
    sessions: [{
      id: "anonymous-session",
      deckId: "anonymous-deck",
      name: "LIG高田馬場",
      date: "2026-07-20",
      format: "BO1",
      environment: "9弾環境"
    }]
  });

  const result = mergeAccountStates(account, anonymous);

  assert.equal(result.state.decks.length, 2);
  assert.equal(result.state.sessions.length, 2);
  assert.equal(result.ambiguous.length, 2);
  assert.deepEqual(result.ambiguous.map((item) => item.type), ["deck", "session"]);
});

test("applies confirmed duplicate choices and remaps child records", () => {
  const account = state({
    decks: [{ id: "account-deck", name: "鬼丸剣道", version: "v1" }],
    sessions: [{ id: "account-session", deckId: "account-deck", name: "店舗A", date: "2026-07-20" }],
    matches: [{ id: "account-match", sessionId: "account-session", opponentDeck: "青単", result: "win" }]
  });
  const anonymous = state({
    decks: [{ id: "anonymous-deck", name: "鬼丸剣道", version: "v1" }],
    sessions: [{ id: "anonymous-session", deckId: "anonymous-deck", name: "店舗A", date: "2026-07-20" }],
    matches: [{ id: "anonymous-match", sessionId: "anonymous-session", opponentDeck: "緑単", result: "loss" }]
  });

  const result = mergeAccountStates(account, anonymous, {
    sameRecordPairs: [
      { type: "deck", accountId: "account-deck", anonymousId: "anonymous-deck" },
      { type: "session", accountId: "account-session", anonymousId: "anonymous-session" }
    ]
  });

  assert.equal(result.state.decks.length, 1);
  assert.equal(result.state.sessions.length, 1);
  assert.deepEqual(result.state.matches.map((match) => match.sessionId), ["account-session", "account-session"]);
});

test("does not mutate either source state", () => {
  const account = state({ decks: [{ id: "d1", name: "既存" }] });
  const anonymous = state({ decks: [{ id: "d2", name: "匿名" }] });
  const accountSnapshot = structuredClone(account);
  const anonymousSnapshot = structuredClone(anonymous);

  mergeAccountStates(account, anonymous);

  assert.deepEqual(account, accountSnapshot);
  assert.deepEqual(anonymous, anonymousSnapshot);
});
