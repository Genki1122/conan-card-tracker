import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminDashboard,
  buildAdminOverview,
  buildAiTrainingDataset,
  filterAdminUsers
} from "../src/admin-analytics.js";

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
          { sessionId: "s1", myDeck: "鬼丸剣道", opponentDeck: "婚活警視庁", opponentPlayer: "秘密", result: "loss", memo: "個人メモ" },
          { sessionId: "s1", myDeck: "鬼丸剣道", opponentDeck: "FBI", opponentPlayer: "秘密", result: "pending", memo: "対戦中" }
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

test("admin dashboard applies shared filters to environment and matchup analytics", () => {
  const dashboardInput = {
    profiles: [
      { user_id: "u1", username: "ユーザーA", created_at: "2026-06-01T00:00:00Z" },
      { user_id: "u2", username: "ユーザーB", created_at: "2026-06-10T00:00:00Z" }
    ],
    consents: [
      { user_id: "u1", accepted_at: "2026-06-01T00:00:00Z", ai_training_included: true }
    ],
    states: [
      {
        user_id: "u1",
        updated_at: "2026-07-20T00:00:00Z",
        data: {
          decks: [{ id: "d1", name: "デッキA", partnerColor: "blue", caseCardId: "case-blue" }],
          sessions: [
            { id: "s1", deckId: "d1", date: "2026-07-10", environment: "9弾環境", partnerColor: "blue", caseCardId: "case-blue", placement: "second" },
            { id: "s2", deckId: "d1", date: "2026-06-10", environment: "8弾環境", partnerColor: "blue", caseCardId: "case-blue" }
          ],
          matches: [
            { id: "m1", sessionId: "s1", myDeck: "デッキA", opponentDeck: "デッキB", opponentPartnerColor: "green", opponentCaseCardId: "case-green", result: "win", firstPlayer: "first", myPassed: "none", opponentPassed: "none", opponentPlayer: "プレイヤーA" },
            { id: "m2", sessionId: "s1", myDeck: "デッキA", opponentDeck: "デッキC", opponentPartnerColor: "red", opponentCaseCardId: "case-red", result: "loss", firstPlayer: "second", myPassed: "first", opponentPassed: "none", opponentPlayer: "不明" },
            { id: "m3", sessionId: "s1", myDeck: "デッキA", opponentDeck: "不明", result: "pending", firstPlayer: "first", myPassed: "none", opponentPassed: "none", opponentPlayer: "不明" },
            { id: "m4", sessionId: "s2", myDeck: "デッキA", opponentDeck: "デッキD", opponentPartnerColor: "black", result: "win", firstPlayer: "second", myPassed: "none", opponentPassed: "none", opponentPlayer: "プレイヤーB" }
          ]
        }
      },
      {
        user_id: "u2",
        updated_at: "2026-07-19T00:00:00Z",
        data: {
          decks: [{ id: "d2", name: "デッキE", partnerColor: "white" }],
          sessions: [{ id: "s3", deckId: "d2", date: "2026-07-11", environment: "9弾環境", partnerColor: "white" }],
          matches: [
            { id: "m5", sessionId: "s3", myDeck: "デッキE", opponentDeck: "デッキF", opponentPartnerColor: "yellow", result: "win", firstPlayer: "first", myPassed: "none", opponentPassed: "none", opponentPlayer: "プレイヤーC" }
          ]
        }
      }
    ]
  };

  const dashboard = buildAdminDashboard(dashboardInput, {
    month: "2026-07",
    environment: "9弾環境",
    excludePasses: true,
    consentedOnly: true
  }, new Date("2026-07-22T00:00:00Z"));

  assert.equal(dashboard.summary.matches, 1);
  assert.equal(dashboard.summary.sessions, 1);
  assert.equal(dashboard.summary.winRate, 100);
  assert.deepEqual(dashboard.environment.myColors[0], {
    name: "blue",
    total: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    winRate: 100,
    percentage: 100
  });
  assert.deepEqual(dashboard.matchups[0], {
    myColor: "blue",
    opponentColor: "green",
    total: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    winRate: 100,
    first: { total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 },
    second: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
    unrecordedTurn: { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
    opponentCaseCards: [
      { name: "case-green", total: 1, wins: 1, losses: 0, draws: 0, winRate: 100, percentage: 100 }
    ]
  });
  assert.deepEqual(dashboard.filterOptions.months, ["2026-07", "2026-06"]);
  assert.deepEqual(dashboard.filterOptions.environments, ["8弾環境", "9弾環境"]);
  assert.equal(dashboard.quality.totalRecords, 2);
});

test("admin dashboard separates usage and data-quality metrics from completed results", () => {
  const dashboard = buildAdminDashboard(input, {}, new Date("2026-07-22T00:00:00Z"));

  assert.equal(dashboard.usage.registeredUsers, 2);
  assert.equal(dashboard.usage.activatedUsers, 1);
  assert.equal(dashboard.usage.activeUsers30d, 1);
  assert.equal(dashboard.usage.inactiveUsers30d, 1);
  assert.equal(dashboard.quality.totalRecords, 3);
  assert.equal(dashboard.quality.pendingMatches, 1);
  assert.equal(dashboard.quality.aiEligibleMatches, 2);
  assert.equal(dashboard.quality.fields.find((row) => row.key === "opponentDeck").recorded, 3);
});

test("admin user rows include privacy-safe recovery and support statuses", () => {
  const dashboard = buildAdminDashboard({
    ...input,
    recoveries: [{
      user_id: "u1",
      status: "detected",
      anonymous_matches: 23,
      ambiguous_count: 3,
      updated_at: "2026-07-21T00:00:00Z"
    }]
  }, {}, new Date("2026-07-22T00:00:00Z"));

  const active = dashboard.userRows.find((row) => row.userId === "u1");
  const empty = dashboard.userRows.find((row) => row.userId === "u2");

  assert.equal(active.recovery.status, "detected");
  assert.equal(active.recovery.matches, 23);
  assert.equal(active.needsAttention, true);
  assert.equal(active.stale, false);
  assert.equal(empty.empty, true);
  assert.equal(empty.stale, true);
});

test("admin users can be searched, filtered, and sorted for support work", () => {
  const rows = [
    { userId: "u1", username: "なあちゃん", matches: 20, sessions: 5, winRate: 60, lastUpdated: "2026-07-20", needsAttention: true, recovery: { active: true }, stale: false, empty: false },
    { userId: "u2", username: "平次", matches: 50, sessions: 10, winRate: 70, lastUpdated: "2026-07-21", needsAttention: false, recovery: { active: false }, stale: false, empty: false },
    { userId: "u3", username: "コナン", matches: 0, sessions: 0, winRate: 0, lastUpdated: "", needsAttention: true, recovery: { active: false }, stale: true, empty: true }
  ];

  assert.deepEqual(filterAdminUsers(rows, {
    query: "なあ",
    status: "all",
    sort: "attention",
    direction: "desc"
  }).map((row) => row.userId), ["u1"]);
  assert.deepEqual(filterAdminUsers(rows, {
    status: "recovery",
    sort: "latest",
    direction: "desc"
  }).map((row) => row.userId), ["u1"]);
  assert.deepEqual(filterAdminUsers(rows, {
    status: "all",
    sort: "matches",
    direction: "asc"
  }).map((row) => row.userId), ["u3", "u1", "u2"]);
});

test("admin dashboard clears hidden filter values and counts privacy-safe player recording flags", () => {
  const dashboard = buildAdminDashboard({
    profiles: [{ user_id: "u1", username: "利用者" }],
    consents: [],
    states: [{
      user_id: "u1",
      updated_at: "2026-07-20T00:00:00Z",
      data: {
        decks: [{ id: "d1", name: "デッキ" }],
        sessions: [{ id: "s1", deckId: "d1", date: "2026-07-01", environment: "10弾環境" }],
        matches: [
          { sessionId: "s1", result: "win", opponentPlayerRecorded: true },
          { sessionId: "s1", result: "pending", opponentPlayerRecorded: false }
        ]
      }
    }]
  }, {
    month: "2026-06",
    environment: "存在しない環境"
  }, new Date("2026-07-22T00:00:00Z"));

  assert.equal(dashboard.filters.month, "");
  assert.equal(dashboard.filters.environment, "");
  assert.equal(dashboard.summary.matches, 1);
  assert.equal(dashboard.quality.fields.find((row) => row.key === "opponentPlayer").recorded, 1);
});

test("matchup analytics expose completed matches whose turn is unrecorded", () => {
  const dashboard = buildAdminDashboard({
    profiles: [{ user_id: "u1", username: "利用者" }],
    consents: [],
    states: [{
      user_id: "u1",
      updated_at: "2026-07-20T00:00:00Z",
      data: {
        decks: [{ id: "d1", name: "デッキ", partnerColor: "blue" }],
        sessions: [{ id: "s1", deckId: "d1", date: "2026-07-01", environment: "10弾環境" }],
        matches: [{
          sessionId: "s1",
          result: "loss",
          firstPlayer: "",
          opponentPartnerColor: "green"
        }]
      }
    }]
  });

  assert.deepEqual(dashboard.matchups[0].unrecordedTurn, {
    total: 1,
    wins: 0,
    losses: 1,
    draws: 0,
    winRate: 0
  });
});
