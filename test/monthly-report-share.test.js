import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyHistoryRows,
  canShareMonthlyReport,
  historyImageLayout,
  monthlyOutcomeLabel,
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

test("file sharing capability checks fail closed on unsupported browsers", () => {
  const files = [{ name: "summary.png" }, { name: "events.png" }];

  assert.equal(canShareMonthlyReport(files, {}), false);
  assert.equal(canShareMonthlyReport(files, {
    share() {},
    canShare() { return true; }
  }), true);
  assert.equal(canShareMonthlyReport(files, {
    share() {},
    canShare() { throw new TypeError("unsupported files"); }
  }), false);
});
