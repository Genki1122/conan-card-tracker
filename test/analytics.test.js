import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDeckBreakdown,
  getOpponentBreakdown,
  getOpponentTurnBreakdown,
  getAnalysisInsights,
  getCrossBreakdown,
  getPlayerBreakdown,
  getPlayerRecord,
  getRpsBreakdown,
  summarizeDecks,
  summarizeMatches
} from "../src/analytics.js";

const matches = [
  {
    id: "1",
    date: "2026-06-01",
    myDeck: "赤青コナン",
    opponentDeck: "緑服部",
    result: "win",
    firstPlayer: "first",
    eventType: "shop"
  },
  {
    id: "2",
    date: "2026-06-01",
    myDeck: "赤青コナン",
    opponentDeck: "緑服部",
    result: "loss",
    firstPlayer: "second",
    eventType: "free"
  },
  {
    id: "3",
    date: "2026-06-02",
    myDeck: "青蘭",
    opponentDeck: "黄安室",
    result: "win",
    firstPlayer: "second",
    eventType: "shop"
  }
];

describe("summarizeMatches", () => {
  it("calculates totals, win rate, first/second win rates, and current streak", () => {
    assert.deepEqual(summarizeMatches(matches), {
      total: 3,
      wins: 2,
      losses: 1,
      winRate: 66.7,
      first: { total: 1, wins: 1, winRate: 100 },
      second: { total: 2, wins: 1, winRate: 50 },
      currentStreak: { result: "win", count: 1 }
    });
  });

  it("returns zeroed values for an empty history", () => {
    assert.deepEqual(summarizeMatches([]), {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      first: { total: 0, wins: 0, winRate: 0 },
      second: { total: 0, wins: 0, winRate: 0 },
      currentStreak: { result: null, count: 0 }
    });
  });
});

describe("getDeckBreakdown", () => {
  it("groups performance by the user's deck", () => {
    assert.deepEqual(getDeckBreakdown(matches), [
      { name: "赤青コナン", total: 2, wins: 1, losses: 1, draws: 0, winRate: 50 },
      { name: "青蘭", total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 }
    ]);
  });
});

describe("getOpponentBreakdown", () => {
  it("groups performance by opposing deck", () => {
    assert.deepEqual(getOpponentBreakdown(matches), [
      { name: "緑服部", total: 2, wins: 1, losses: 1, draws: 0, winRate: 50 },
      { name: "黄安室", total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 }
    ]);
  });
});

describe("session and player analytics", () => {
  const decks = [
    { id: "deck-1", name: "高木婚活" },
    { id: "deck-2", name: "赤青コナン" }
  ];
  const sessions = [
    { id: "session-1", deckId: "deck-1", name: "秋葉原チェルモ", date: "2026-05-30" },
    { id: "session-2", deckId: "deck-1", name: "カードマウンテン", date: "2026-05-29" },
    { id: "session-3", deckId: "deck-2", name: "五反田探偵事務所", date: "2026-05-28" }
  ];
  const sessionMatches = [
    {
      id: "match-1",
      sessionId: "session-1",
      myDeck: "高木婚活",
      opponentDeck: "婚活警視庁",
      result: "win",
      firstPlayer: "first",
      opponentRps: "rock",
      myPassed: false,
      opponentPassed: true,
      opponentPlayer: "佐藤さん"
    },
    {
      id: "match-2",
      sessionId: "session-1",
      myDeck: "高木婚活",
      opponentDeck: "白黄王冠",
      result: "loss",
      firstPlayer: "second",
      opponentRps: "scissors",
      myPassed: true,
      opponentPassed: false,
      opponentPlayer: "田中さん"
    },
    {
      id: "match-3",
      sessionId: "session-2",
      myDeck: "高木婚活",
      opponentDeck: "婚活警視庁",
      result: "win",
      firstPlayer: "second",
      opponentRps: "paper",
      myPassed: false,
      opponentPassed: false,
      opponentPlayer: "佐藤さん"
    },
    {
      id: "match-4",
      sessionId: "session-3",
      myDeck: "赤青コナン",
      opponentDeck: "緑服部",
      result: "draw",
      firstPlayer: "first",
      opponentRps: "rock",
      myPassed: false,
      opponentPassed: false,
      opponentPlayer: "鈴木さん"
    }
  ];

  it("summarizes each deck across sessions including draws", () => {
    assert.deepEqual(summarizeDecks(decks, sessions, sessionMatches), [
      {
        id: "deck-1",
        name: "高木婚活",
        sessions: 2,
        total: 3,
        wins: 2,
        losses: 1,
        draws: 0,
        winRate: 66.7,
        first: { total: 1, wins: 1, winRate: 100 },
        second: { total: 2, wins: 1, winRate: 50 }
      },
      {
        id: "deck-2",
        name: "赤青コナン",
        sessions: 1,
        total: 1,
        wins: 0,
        losses: 0,
        draws: 1,
        winRate: 0,
        first: { total: 1, wins: 0, winRate: 0 },
        second: { total: 0, wins: 0, winRate: 0 }
      }
    ]);
  });

  it("groups opponent player records and keeps match history", () => {
    assert.deepEqual(getPlayerBreakdown(sessionMatches), [
      { name: "佐藤さん", total: 2, wins: 2, losses: 0, draws: 0, winRate: 100 },
      { name: "田中さん", total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
      { name: "鈴木さん", total: 1, wins: 0, losses: 0, draws: 1, winRate: 0 }
    ]);

    assert.deepEqual(getPlayerRecord("佐藤さん", sessionMatches), {
      name: "佐藤さん",
      total: 2,
      wins: 2,
      losses: 0,
      draws: 0,
      winRate: 100,
      matches: [sessionMatches[0], sessionMatches[2]]
    });
  });

  it("calculates opponent rock-paper-scissors percentages for a player", () => {
    assert.deepEqual(getRpsBreakdown(getPlayerRecord("佐藤さん", sessionMatches).matches), [
      { key: "rock", label: "グー", total: 1, percentage: 50 },
      { key: "paper", label: "パー", total: 1, percentage: 50 },
      { key: "scissors", label: "チョキ", total: 0, percentage: 0 },
      { key: "unknown", label: "未記録", total: 0, percentage: 0 }
    ]);
  });

  it("surfaces actionable analysis insights for tuning", () => {
    assert.deepEqual(getAnalysisInsights(sessionMatches), {
      bestMatchup: { name: "婚活警視庁", total: 2, wins: 2, losses: 0, draws: 0, winRate: 100 },
      worstMatchup: { name: "白黄王冠", total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
      turnGap: { stronger: "first", weaker: "second", gap: 0 },
      passRecord: {
        noPass: { total: 2, wins: 1, winRate: 50 },
        anyPass: { total: 2, wins: 1, winRate: 50 }
      }
    });
  });

  it("adds first and second records to opponent deck rows", () => {
    assert.deepEqual(getOpponentTurnBreakdown(sessionMatches), [
      {
        name: "婚活警視庁",
        total: 2,
        wins: 2,
        losses: 0,
        draws: 0,
        winRate: 100,
        first: { total: 1, wins: 1, winRate: 100 },
        second: { total: 1, wins: 1, winRate: 100 }
      },
      {
        name: "白黄王冠",
        total: 1,
        wins: 0,
        losses: 1,
        draws: 0,
        winRate: 0,
        first: { total: 0, wins: 0, winRate: 0 },
        second: { total: 1, wins: 0, winRate: 0 }
      },
      {
        name: "緑服部",
        total: 1,
        wins: 0,
        losses: 0,
        draws: 1,
        winRate: 0,
        first: { total: 1, wins: 0, winRate: 0 },
        second: { total: 0, wins: 0, winRate: 0 }
      }
    ]);
  });

  it("builds cross breakdown rows with turn and pass splits", () => {
    assert.deepEqual(getCrossBreakdown(sessionMatches, "opponentDeck"), [
      {
        name: "婚活警視庁",
        total: 2,
        wins: 2,
        losses: 0,
        draws: 0,
        winRate: 100,
        first: { total: 1, wins: 1, winRate: 100 },
        second: { total: 1, wins: 1, winRate: 100 },
        noPass: { total: 1, wins: 1, winRate: 100 },
        anyPass: { total: 1, wins: 1, winRate: 100 }
      },
      {
        name: "白黄王冠",
        total: 1,
        wins: 0,
        losses: 1,
        draws: 0,
        winRate: 0,
        first: { total: 0, wins: 0, winRate: 0 },
        second: { total: 1, wins: 0, winRate: 0 },
        noPass: { total: 0, wins: 0, winRate: 0 },
        anyPass: { total: 1, wins: 0, winRate: 0 }
      },
      {
        name: "緑服部",
        total: 1,
        wins: 0,
        losses: 0,
        draws: 1,
        winRate: 0,
        first: { total: 1, wins: 0, winRate: 0 },
        second: { total: 0, wins: 0, winRate: 0 },
        noPass: { total: 1, wins: 0, winRate: 0 },
        anyPass: { total: 0, wins: 0, winRate: 0 }
      }
    ]);
  });
});
