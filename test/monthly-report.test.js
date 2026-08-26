import assert from "node:assert/strict";
import test from "node:test";

import { buildMonthlyReport } from "../src/monthly-report.js";

const state = {
  decks: [
    { id: "deck-a", name: "鬼丸剣道" },
    { id: "deck-b", name: "疾風" }
  ],
  sessions: [
    {
      id: "aug-early",
      deckId: "deck-a",
      name: "カードショップA",
      date: "2026-08-03",
      createdAt: "2026-08-03T01:00:00.000Z",
      recordType: "challenge",
      placement: "second",
      randomPrizeWon: true
    },
    {
      id: "aug-late",
      deckId: "deck-b",
      name: "カードショップB",
      date: "2026-08-24",
      createdAt: "2026-08-24T09:00:00.000Z",
      recordType: "challenge",
      placement: "champion",
      randomPrizeWon: false
    },
    {
      id: "aug-free",
      deckId: "deck-a",
      name: "フリー会",
      date: "2026-08-25",
      createdAt: "2026-08-25T09:00:00.000Z",
      recordType: "free",
      placement: "",
      randomPrizeWon: false
    },
    {
      id: "july",
      deckId: "deck-a",
      name: "7月大会",
      date: "2026-07-31",
      createdAt: "2026-07-31T09:00:00.000Z",
      recordType: "challenge",
      placement: "top4",
      randomPrizeWon: false
    }
  ],
  matches: [
    { id: "m1", sessionId: "aug-early", result: "win", firstPlayer: "first", myPassed: "none", opponentPartnerColor: "blue" },
    { id: "m2", sessionId: "aug-early", result: "loss", firstPlayer: "second", myPassed: "pass1", opponentPartnerColor: "red" },
    { id: "m3", sessionId: "aug-late", result: "win", firstPlayer: "second", myPassed: "none", opponentPartnerColor: "blue" },
    { id: "m4", sessionId: "aug-late", result: "win", roundType: "bye", firstPlayer: "", myPassed: "none" },
    { id: "m5", sessionId: "aug-free", result: "win", firstPlayer: "first", myPassed: "none" },
    { id: "m6", sessionId: "july", result: "loss", firstPlayer: "first", myPassed: "none" }
  ]
};

test("monthly report limits records to the selected month and record type", () => {
  const report = buildMonthlyReport(state, { month: "2026-08", recordType: "challenge" });

  assert.equal(report.sessionCount, 2);
  assert.deepEqual(report.summary, {
    total: 3,
    wins: 2,
    losses: 1,
    draws: 0,
    winRate: 66.7
  });
  assert.deepEqual(report.passUsage, { used: 1, total: 3, rate: 33.3 });
});

test("monthly report collects awards, deck records, and newest-first event history", () => {
  const report = buildMonthlyReport(state, { month: "2026-08", recordType: "challenge" });

  assert.deepEqual(report.awards, {
    champion: 1,
    second: 1,
    top4: 0,
    random: 1
  });
  assert.deepEqual(report.decks.map((deck) => [deck.name, deck.sessions, deck.total]), [
    ["鬼丸剣道", 1, 2],
    ["疾風", 1, 1]
  ]);
  assert.deepEqual(report.events.map((event) => event.id), ["aug-late", "aug-early"]);
  assert.equal(report.events[0].record.total, 2);
  assert.equal(report.events[0].record.wins, 2);
});

test("monthly report groups completed records by opponent color for each deck", () => {
  const report = buildMonthlyReport(state, { month: "2026-08", recordType: "challenge" });
  const onimaru = report.decks.find((deck) => deck.id === "deck-a");
  const hayate = report.decks.find((deck) => deck.id === "deck-b");

  assert.deepEqual(report.opponentColorUsage, { recorded: 3, total: 3 });
  assert.deepEqual(onimaru.opponentColors.map((color) => [color.id, color.total, color.winRate]), [
    ["blue", 1, 100],
    ["green", 0, 0],
    ["white", 0, 0],
    ["red", 1, 0],
    ["yellow", 0, 0],
    ["black", 0, 0]
  ]);
  assert.equal(hayate.opponentColors.find((color) => color.id === "blue").winRate, 100);
});
