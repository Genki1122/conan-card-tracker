import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRepairQueue,
  missingQualityFields,
  qualityRows,
  repairTargetForFields
} from "../src/data-quality.js";

test("finds missing match and session fields with shared definitions", () => {
  const missing = missingQualityFields(
    {
      opponentPlayer: "不明",
      opponentDeck: "青単",
      opponentPartnerColor: "",
      opponentCaseCardId: ""
    },
    { environment: "未設定", partnerColor: "green", caseCardId: "" },
    { partnerColor: "blue", caseCardId: "home-sherlock" }
  );

  assert.deepEqual(missing, [
    "opponentColor",
    "opponentCaseCard",
    "environment"
  ]);
});

test("builds a newest-first repair queue and filters by one field", () => {
  const state = {
    decks: [{ id: "d1", partnerColor: "green", caseCardId: "diplomat" }],
    sessions: [
      { id: "s1", deckId: "d1", date: "2026-07-20", environment: "9弾環境" },
      { id: "s2", deckId: "d1", date: "2026-07-28", environment: "9弾環境" }
    ],
    matches: [
      { id: "m1", sessionId: "s1", opponentPlayer: "A", opponentDeck: "青単", opponentPartnerColor: "", opponentCaseCardId: "" },
      { id: "m2", sessionId: "s2", opponentPlayer: "不明", opponentDeck: "赤単", opponentPartnerColor: "red", opponentCaseCardId: "scarlet-return" }
    ]
  };

  assert.deepEqual(buildRepairQueue(state).map((item) => item.match.id), ["m1"]);
  assert.deepEqual(buildRepairQueue(state, "opponentColor").map((item) => item.match.id), ["m1"]);
  assert.deepEqual(buildRepairQueue(state, "opponentPlayer"), []);
});

test("treats an explicitly unknown player as completed input", () => {
  assert.equal(
    missingQualityFields({ opponentPlayer: "不明" }, {}, {}).includes("opponentPlayer"),
    false
  );
  assert.equal(
    missingQualityFields({ opponentPlayer: "" }, {}, {}).includes("opponentPlayer"),
    true
  );
});

test("quality rows expose affected users without identities from match content", () => {
  const rows = qualityRows([
    { userId: "u1", opponentPlayerRecorded: false, opponentDeck: "不明" },
    { userId: "u1", opponentPlayerRecorded: true, opponentDeck: "青単" },
    { userId: "u2", opponentPlayerRecorded: false, opponentDeck: "緑単" }
  ]);

  const player = rows.find((row) => row.key === "opponentPlayer");
  assert.deepEqual(player.affectedUsers, [
    { userId: "u1", missing: 1 },
    { userId: "u2", missing: 1 }
  ]);
  assert.equal(player.missing, 2);
  assert.equal(rows.find((row) => row.key === "opponentDeck").missing, 1);
});

test("routes shared deck metadata to session editing and opponent data to match editing", () => {
  assert.equal(repairTargetForFields(["myColor"], "myColor"), "session");
  assert.equal(repairTargetForFields(["myCaseCard"]), "session");
  assert.equal(repairTargetForFields(["environment"]), "session");
  assert.equal(repairTargetForFields(["opponentColor"], "opponentColor"), "match");
  assert.equal(repairTargetForFields(["opponentPlayer"]), "match");
});
