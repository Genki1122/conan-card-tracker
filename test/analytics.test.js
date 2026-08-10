import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canWinRandomPrize,
  filterMatchesByEnvironment,
  filterMatchesByMonth,
  filterMatchesWithoutPasses,
  filterDecksByArchived,
  formatPercentage,
  formatRecordSummary,
  formatRecordSummaryWithRate,
  formatRecordDate,
  getDeckBreakdown,
  getMyPassUsage,
  getOpponentBreakdown,
  getOpponentTurnBreakdown,
  getAnalysisInsights,
  getColorMatchups,
  getCrossBreakdown,
  getPlayerBreakdown,
  getPlayerDeckOverviews,
  getPlayerOverviews,
  getPlayerOverviewsByMonth,
  getPlayerRecord,
  getRecordedRpsBreakdown,
  getRpsBreakdown,
  getStaffRpsBreakdown,
  summarizeDecks,
  summarizeMatches,
  summarizeRounds,
  isByeRound,
  isPlayedMatch,
  isResolvedRound,
  isSmallSample,
  playerWinRateTone,
  sortPlayerOverviews
} from "../src/analytics.js";

describe("bye round boundaries", () => {
  const rounds = [
    { result: "win", roundType: "played", firstPlayer: "first", opponentDeck: "青単", myPassed: "none" },
    { result: "win", roundType: "bye", firstPlayer: "", opponentDeck: "", myPassed: "pass1" },
    { result: "loss", firstPlayer: "second", opponentDeck: "緑単", myPassed: "none" },
    { result: "pending", roundType: "played", firstPlayer: "first", opponentDeck: "赤単" }
  ];

  it("counts a bye in official round results but excludes it from gameplay results", () => {
    assert.deepEqual(
      summarizeRounds(rounds),
      {
        total: 3,
        wins: 2,
        losses: 1,
        winRate: 66.7,
        first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
        second: { total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
        currentStreak: { result: "loss", count: 1 }
      }
    );
    assert.equal(summarizeMatches(rounds).total, 2);
    assert.equal(summarizeMatches(rounds).winRate, 50);
  });

  it("classifies byes as resolved rounds rather than played matches", () => {
    assert.equal(isByeRound(rounds[1]), true);
    assert.equal(isResolvedRound(rounds[1]), true);
    assert.equal(isPlayedMatch(rounds[1]), false);
    assert.equal(isPlayedMatch(rounds[0]), true);
  });

  it("keeps byes out of opponent and pass analysis", () => {
    assert.deepEqual(getOpponentBreakdown(rounds).map((row) => row.name), ["青単", "緑単"]);
    assert.deepEqual(getMyPassUsage(rounds), { used: 0, total: 2, rate: 0 });
  });
});

describe("color matchup matrix", () => {
  it("groups completed matches by both partner colors with turn and case-card details", () => {
    const rows = getColorMatchups([
      { result: "win", firstPlayer: "first", myPartnerColor: "blue", opponentPartnerColor: "green", opponentCaseCard: "外交官殺人事件" },
      { result: "loss", firstPlayer: "second", myPartnerColor: "blue", opponentPartnerColor: "green", opponentCaseCard: "外交官殺人事件" },
      { result: "draw", firstPlayer: "", myPartnerColor: "blue", opponentPartnerColor: "green", opponentCaseCard: "浪花の連続殺人事件" },
      { result: "pending", firstPlayer: "first", myPartnerColor: "blue", opponentPartnerColor: "green", opponentCaseCard: "未確定" },
      { result: "win", firstPlayer: "first", myPartnerColor: "", opponentPartnerColor: "green" }
    ]);

    assert.deepEqual(rows, [{
      myColor: "blue",
      opponentColor: "green",
      total: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      winRate: 33.3,
      first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
      second: { total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
      unrecordedTurn: { total: 1, wins: 0, losses: 0, draws: 1, winRate: 0 },
      opponentCaseCards: [
        {
          name: "外交官殺人事件",
          total: 2,
          wins: 1,
          losses: 1,
          draws: 0,
          winRate: 50,
          first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
          second: { total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
          unrecordedTurn: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }
        },
        {
          name: "浪花の連続殺人事件",
          total: 1,
          wins: 0,
          losses: 0,
          draws: 1,
          winRate: 0,
          first: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
          second: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
          unrecordedTurn: { total: 1, wins: 0, losses: 0, draws: 1, winRate: 0 }
        }
      ]
    }]);
  });

  it("keeps only cells at or above the requested sample size", () => {
    const tenMatches = Array.from({ length: 10 }, () => ({
      result: "win",
      myPartnerColor: "red",
      opponentPartnerColor: "white"
    }));
    const elevenMatches = Array.from({ length: 11 }, () => ({
      result: "loss",
      myPartnerColor: "white",
      opponentPartnerColor: "red"
    }));

    assert.deepEqual(
      getColorMatchups([...tenMatches, ...elevenMatches], 11).map((row) => [row.myColor, row.opponentColor, row.total]),
      [["white", "red", 11]]
    );
  });

  it("treats ten matches as a small sample and eleven as established", () => {
    assert.equal(isSmallSample(10), true);
    assert.equal(isSmallSample(11), false);
  });
});

describe("record summary formatting", () => {
  it("always displays wins, losses, draws, and total matches", () => {
    assert.equal(
      formatRecordSummary({ wins: 2, losses: 1, draws: 1, total: 4 }),
      "2-1-1 / 4戦"
    );
    assert.equal(
      formatRecordSummary({ wins: 3, total: 5 }),
      "3-2-0 / 5戦"
    );
    assert.equal(
      formatRecordSummaryWithRate({ wins: 1, losses: 3, draws: 0, total: 4, winRate: 25 }),
      "1-3-0 / 4戦 25.0%"
    );
  });
});

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
      first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
      second: { total: 2, wins: 1, losses: 1, draws: 0, winRate: 50 },
      currentStreak: { result: "win", count: 1 }
    });
  });

  it("returns zeroed values for an empty history", () => {
    assert.deepEqual(summarizeMatches([]), {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      first: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
      second: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
      currentStreak: { result: null, count: 0 }
    });
  });

  it("excludes matches whose result is still pending", () => {
    assert.deepEqual(summarizeMatches([
      ...matches,
      { id: "pending", date: "2026-06-03", result: "pending", firstPlayer: "first" }
    ]), {
      total: 3,
      wins: 2,
      losses: 1,
      winRate: 66.7,
      first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
      second: { total: 2, wins: 1, losses: 1, draws: 0, winRate: 50 },
      currentStreak: { result: "win", count: 1 }
    });
  });

  it("keeps draws separate from losses in first and second records", () => {
    const summary = summarizeMatches([
      { id: "draw-first", result: "draw", firstPlayer: "first" },
      { id: "loss-second", result: "loss", firstPlayer: "second" }
    ]);

    assert.deepEqual(summary.first, {
      total: 1,
      wins: 0,
      losses: 0,
      draws: 1,
      winRate: 0
    });
    assert.deepEqual(summary.second, {
      total: 1,
      wins: 0,
      losses: 1,
      draws: 0,
      winRate: 0
    });
  });
});

describe("pass exclusion analysis", () => {
  it("keeps only matches where neither player used a pass", () => {
    const passMatches = [
      { id: "none", myPassed: "none", opponentPassed: "none" },
      { id: "my-pass", myPassed: "pass1", opponentPassed: "none" },
      { id: "opponent-pass", myPassed: "none", opponentPassed: "pass2" },
      { id: "legacy-none", myPassed: false, opponentPassed: "false" },
      { id: "legacy-pass", myPassed: true, opponentPassed: false }
    ];

    assert.deepEqual(
      filterMatchesWithoutPasses(passMatches).map((match) => match.id),
      ["none", "legacy-none"]
    );
  });

  it("calculates the user's pass rate from completed matches only", () => {
    assert.deepEqual(getMyPassUsage([
      { result: "win", myPassed: "none" },
      { result: "loss", myPassed: "pass1" },
      { result: "draw", myPassed: true },
      { result: "win", myPassed: false },
      { result: "pending", myPassed: "pass2" }
    ]), {
      used: 2,
      total: 4,
      rate: 50
    });
  });
});

describe("analysis percentage formatting", () => {
  it("always displays one decimal place", () => {
    assert.equal(formatPercentage(50), "50.0%");
    assert.equal(formatPercentage(66.7), "66.7%");
    assert.equal(formatPercentage(undefined), "0.0%");
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

describe("calendar month and store archive analytics", () => {
  it("excludes only champions from random prize eligibility", () => {
    assert.equal(canWinRandomPrize("champion"), false);
    assert.equal(canWinRandomPrize("second"), true);
    assert.equal(canWinRandomPrize("top4"), true);
    assert.equal(canWinRandomPrize(""), true);
  });

  it("filters enriched matches by calendar month", () => {
    assert.deepEqual(filterMatchesByMonth(matches, "2026-06"), matches);
    assert.deepEqual(filterMatchesByMonth(matches, "2026-07"), []);
    assert.deepEqual(filterMatchesByMonth(matches, ""), matches);
  });

  it("groups cross breakdown rows by calendar month", () => {
    const rows = getCrossBreakdown([
      ...matches,
      { ...matches[0], id: "4", date: "2026-07-01", result: "loss" }
    ], "month");
    assert.deepEqual(rows.map(({ name, total, wins, losses }) => ({ name, total, wins, losses })), [
      { name: "2026-06", total: 3, wins: 2, losses: 1 },
      { name: "2026-07", total: 1, wins: 0, losses: 1 }
    ]);
  });

  it("calculates staff hand probabilities with an independent denominator per hand", () => {
    const sessions = [
      { staffRpsHands: ["rock", "paper", "scissors"] },
      { staffRpsHands: ["rock", "scissors", ""] },
      { staffRpsHands: ["paper", "", ""] },
      { staffRpsHands: [] }
    ];
    assert.deepEqual(getStaffRpsBreakdown(sessions), [
      {
        position: 1,
        total: 3,
        rows: [
          { key: "rock", label: "グー", total: 2, percentage: 66.7 },
          { key: "paper", label: "パー", total: 1, percentage: 33.3 },
          { key: "scissors", label: "チョキ", total: 0, percentage: 0 }
        ]
      },
      {
        position: 2,
        total: 2,
        rows: [
          { key: "rock", label: "グー", total: 0, percentage: 0 },
          { key: "paper", label: "パー", total: 1, percentage: 50 },
          { key: "scissors", label: "チョキ", total: 1, percentage: 50 }
        ]
      },
      {
        position: 3,
        total: 1,
        rows: [
          { key: "rock", label: "グー", total: 0, percentage: 0 },
          { key: "paper", label: "パー", total: 0, percentage: 0 },
          { key: "scissors", label: "チョキ", total: 1, percentage: 100 }
        ]
      }
    ]);
  });
});

describe("player quick lookup analytics", () => {
  const lookupMatches = [
    { id: "p1", opponentPlayer: "佐藤さん", opponentDeck: "警視庁", opponentRps: "rock", result: "win", date: "2026-07-01", store: "店舗A" },
    { id: "p2", opponentPlayer: "佐藤さん", opponentDeck: "長野", opponentRps: "unknown", result: "loss", date: "2026-07-20", store: "店舗B" },
    { id: "p3", opponentPlayer: "田中さん", opponentDeck: "王冠", opponentRps: "paper", result: "win", date: "2026-07-10", store: "店舗C" },
    { id: "p4", opponentPlayer: "未登録", opponentDeck: "不明", opponentRps: "scissors", result: "loss", date: "2026-07-21", store: "店舗D" },
    { id: "p5", opponentPlayer: "不明", opponentDeck: "不明", opponentRps: "rock", result: "loss", date: "2026-07-22", store: "店舗E" }
  ];

  it("excludes unknown names and includes latest match context", () => {
    assert.deepEqual(getPlayerOverviews(lookupMatches).map((row) => ({
      name: row.name,
      total: row.total,
      latestDate: row.latestMatch.date,
      latestDeck: row.latestMatch.opponentDeck,
      latestStore: row.latestMatch.store
    })), [
      { name: "佐藤さん", total: 2, latestDate: "2026-07-20", latestDeck: "長野", latestStore: "店舗B" },
      { name: "田中さん", total: 1, latestDate: "2026-07-10", latestDeck: "王冠", latestStore: "店舗C" }
    ]);
  });

  it("includes a known player whose only match is still pending", () => {
    const rows = getPlayerOverviews([
      {
        id: "pending-1",
        opponentPlayer: "対戦中さん",
        opponentDeck: "疾風",
        opponentRps: "scissors",
        result: "pending",
        date: "2026-07-30",
        store: "店舗A"
      }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "対戦中さん");
    assert.equal(rows[0].total, 0);
    assert.equal(rows[0].latestMatch.opponentDeck, "疾風");
    assert.equal(rows[0].recordedRps.total, 1);
  });

  it("sorts opponent decks by latest use and exposes the latest color and case card", () => {
    const rows = getPlayerDeckOverviews([
      {
        id: "m1",
        opponentDeck: "白黄前髪",
        opponentPartnerColor: "white",
        opponentCaseCard: "怪盗キッドと四名画",
        result: "win",
        date: "2026-07-01"
      },
      {
        id: "m2",
        opponentDeck: "疾風",
        opponentPartnerColor: "yellow",
        opponentCaseCard: "風の女神",
        result: "loss",
        date: "2026-07-20"
      },
      {
        id: "m3",
        opponentDeck: "白黄前髪",
        opponentPartnerColor: "yellow",
        opponentCaseCard: "キッドvs安室 王妃の前髪",
        result: "pending",
        date: "2026-07-30"
      }
    ]);

    assert.deepEqual(rows.map((row) => row.name), ["白黄前髪", "疾風"]);
    assert.deepEqual({
      total: rows[0].total,
      wins: rows[0].wins,
      latestColor: rows[0].latestMatch.opponentPartnerColor,
      latestCaseCard: rows[0].latestMatch.opponentCaseCard
    }, {
      total: 1,
      wins: 1,
      latestColor: "yellow",
      latestCaseCard: "キッドvs安室 王妃の前髪"
    });
  });

  it("calculates hand tendency using only recorded RPS matches", () => {
    assert.deepEqual(getRecordedRpsBreakdown(lookupMatches.slice(0, 3)), {
      total: 2,
      rows: [
        { key: "rock", label: "グー", total: 1, percentage: 50 },
        { key: "paper", label: "パー", total: 1, percentage: 50 },
        { key: "scissors", label: "チョキ", total: 0, percentage: 0 }
      ]
    });
  });

  it("sorts player rows in both directions", () => {
    const rows = getPlayerOverviews(lookupMatches);
    assert.deepEqual(sortPlayerOverviews(rows, "latest", "desc").map((row) => row.name), ["佐藤さん", "田中さん"]);
    assert.deepEqual(sortPlayerOverviews(rows, "matches", "asc").map((row) => row.name), ["田中さん", "佐藤さん"]);
    assert.deepEqual(sortPlayerOverviews(rows, "winRate", "asc").map((row) => row.name), ["佐藤さん", "田中さん"]);
  });

  it("uses a neutral tone from 40 through 60 percent", () => {
    assert.equal(playerWinRateTone(39.9), "negative");
    assert.equal(playerWinRateTone(40), "neutral");
    assert.equal(playerWinRateTone(60), "neutral");
    assert.equal(playerWinRateTone(60.1), "positive");
  });

  it("filters player overviews by calendar month", () => {
    assert.deepEqual(
      getPlayerOverviewsByMonth(lookupMatches, "2026-07").map((row) => row.name),
      ["佐藤さん", "田中さん"]
    );
    assert.deepEqual(getPlayerOverviewsByMonth(lookupMatches, "2026-06"), []);
  });

  it("filters enriched matches by environment", () => {
    const matches = [
      { id: "current", environment: "9弾環境" },
      { id: "previous", environment: "8弾環境" },
      { id: "unset" }
    ];
    assert.deepEqual(filterMatchesByEnvironment(matches, "9弾環境").map((match) => match.id), ["current"]);
    assert.deepEqual(filterMatchesByEnvironment(matches).map((match) => match.id), ["current", "previous", "unset"]);
  });
});

describe("compact mobile navigation helpers", () => {
  it("treats legacy decks as active and separates archived decks", () => {
    const decks = [
      { id: "active", name: "現行" },
      { id: "archived", name: "旧環境", archived: true }
    ];
    assert.deepEqual(filterDecksByArchived(decks).map((deck) => deck.id), ["active"]);
    assert.deepEqual(filterDecksByArchived(decks, true).map((deck) => deck.id), ["archived"]);
  });

  it("shows the year only outside the reference year", () => {
    assert.equal(formatRecordDate("2026-07-22", 2026), "7/22(水)");
    assert.equal(formatRecordDate("2025-07-22", 2026), "2025/7/22(火)");
    assert.equal(formatRecordDate("", 2026), "日付未設定");
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
        first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
        second: { total: 2, wins: 1, losses: 1, draws: 0, winRate: 50 }
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
        first: { total: 1, wins: 0, losses: 0, draws: 1, winRate: 0 },
        second: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }
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
        myNoPass: { total: 3, wins: 2, winRate: 66.7 },
        myAnyPass: { total: 1, wins: 0, winRate: 0 },
        opponentNoPass: { total: 3, wins: 1, winRate: 33.3 },
        opponentAnyPass: { total: 1, wins: 1, winRate: 100 }
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
        myNoPass: { total: 2, wins: 2, winRate: 100 },
        myAnyPass: { total: 0, wins: 0, winRate: 0 },
        opponentNoPass: { total: 1, wins: 1, winRate: 100 },
        opponentAnyPass: { total: 1, wins: 1, winRate: 100 }
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
        myNoPass: { total: 0, wins: 0, winRate: 0 },
        myAnyPass: { total: 1, wins: 0, winRate: 0 },
        opponentNoPass: { total: 1, wins: 0, winRate: 0 },
        opponentAnyPass: { total: 0, wins: 0, winRate: 0 }
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
        myNoPass: { total: 1, wins: 0, winRate: 0 },
        myAnyPass: { total: 0, wins: 0, winRate: 0 },
        opponentNoPass: { total: 1, wins: 0, winRate: 0 },
        opponentAnyPass: { total: 0, wins: 0, winRate: 0 }
      }
    ]);
  });
});
