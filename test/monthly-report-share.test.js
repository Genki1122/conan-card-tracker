import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyHistoryRows,
  historyImageLayout,
  monthlyDeckTurnLine,
  monthlyOutcomeLabel,
  monthlyOutcomeTone,
  monthlySummaryStats,
  monthlyShareText
} from "../src/monthly-report-share.js";

function event(index, overrides = {}) {
  return {
    id: `event-${index}`,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    name: `店舗${index + 1}`,
    deckName: `デッキ${index + 1}`,
    placement: "",
    randomPrizeWon: false,
    record: { wins: 3, losses: 1, draws: 0, total: 4 },
    ...overrides
  };
}

test("monthly history keeps one row per event and limits one image to 30 events", () => {
  const report = { events: Array.from({ length: 34 }, (_, index) => event(index)) };
  const result = buildMonthlyHistoryRows(report);

  assert.equal(result.rows.length, 30);
  assert.equal(result.hiddenCount, 4);
  assert.deepEqual(Object.keys(result.rows[0]), ["date", "eventName", "deckName", "outcome", "record"]);
  assert.deepEqual(result.rows[0], {
    date: "8/1",
    eventName: "店舗1",
    deckName: "デッキ1",
    outcome: "",
    record: "3-1-0"
  });
});

test("optional tournament outcomes appear immediately before the record", () => {
  assert.equal(monthlyOutcomeLabel(event(0)), "");
  assert.equal(monthlyOutcomeLabel(event(0, { placement: "champion" })), "優勝");
  assert.equal(monthlyOutcomeLabel(event(0, { placement: "second", randomPrizeWon: true })), "2位・ランダム");
  assert.equal(monthlyOutcomeLabel(event(0, { randomPrizeWon: true })), "ランダム");
  assert.equal(monthlyOutcomeTone("優勝"), "champion");
  assert.equal(monthlyOutcomeTone("2位"), "second");
  assert.equal(monthlyOutcomeTone("ベスト4"), "top4");
  assert.equal(monthlyOutcomeTone("ランダム"), "random");
  assert.equal(monthlyOutcomeTone("2位・ランダム"), "second");
});

test("history image remains a controlled portrait image even with 30 events", () => {
  const sparse = historyImageLayout(8);
  const dense = historyImageLayout(30);

  assert.equal(sparse.width, 1080);
  assert.equal(sparse.height, 1350);
  assert.ok(dense.height > sparse.height);
  assert.ok(dense.height <= 1920);
  assert.ok(dense.rowHeight >= 44);
});

test("share text summarizes the month and leaves final editing to the user", () => {
  const report = {
    sessionCount: 25,
    summary: { wins: 73, losses: 24, draws: 0, total: 97, winRate: 75.3 }
  };

  assert.equal(monthlyShareText(report, {
    monthLabel: "8月",
    recordTypeLabel: "チャレンジ",
    sessionUnit: "大会"
  }), "8月の対戦記録\nチャレンジ 25大会 73-24-0\n勝率 75.3%\n#コナカノート");
});

test("summary stats keep secondary counts beside labels so primary values can stay large", () => {
  const report = {
    sessionCount: 25,
    summary: { wins: 85, losses: 21, draws: 0, total: 106, winRate: 80.2 },
    passUsage: { used: 12, total: 106, rate: 11.3 }
  };

  assert.deepEqual(monthlySummaryStats(report, { sessionUnit: "大会" }), [
    { label: "参加大会", meta: "", value: "25大会" },
    { label: "戦績", meta: "106戦", value: "85-21-0" },
    { label: "勝率", meta: "", value: "80.2%" },
    { label: "パス率", meta: "12回", value: "11.3%" }
  ]);
});

test("deck turn line shows first and second win rates with their sample sizes", () => {
  assert.equal(monthlyDeckTurnLine({
    first: { total: 50, winRate: 78 },
    second: { total: 35, winRate: 86.4 }
  }), "先 78.0%（50戦）｜後 86.4%（35戦）");

  assert.equal(monthlyDeckTurnLine({
    first: { total: 0, winRate: 0 },
    second: { total: 1, winRate: 100 }
  }), "先 --（0戦）｜後 100.0%（1戦）");
});
