import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filterMatchesByRecordType,
  filterSessionsByRecordType,
  normalizeRecordType,
  recordTypeLabel,
  sanitizeSessionForRecordType
} from "../src/record-types.js";

test("legacy and invalid session types default to challenge", () => {
  assert.equal(normalizeRecordType(), "challenge");
  assert.equal(normalizeRecordType("unknown"), "challenge");
  assert.equal(normalizeRecordType("free"), "free");
  assert.equal(normalizeRecordType("tuning"), "tuning");
});

test("record type labels are consistent across screens", () => {
  assert.equal(recordTypeLabel("challenge"), "チャレンジ戦");
  assert.equal(recordTypeLabel("free"), "フリー対戦");
  assert.equal(recordTypeLabel("tuning"), "調整対戦");
  assert.equal(recordTypeLabel("all"), "すべて");
});

test("sessions and enriched matches filter by record type", () => {
  const sessions = [
    { id: "legacy" },
    { id: "free", recordType: "free" },
    { id: "tuning", recordType: "tuning" }
  ];
  const matches = sessions.map((session) => ({ id: session.id, recordType: session.recordType }));

  assert.deepEqual(filterSessionsByRecordType(sessions).map((item) => item.id), ["legacy"]);
  assert.deepEqual(filterSessionsByRecordType(sessions, "free").map((item) => item.id), ["free"]);
  assert.deepEqual(filterSessionsByRecordType(sessions, "all").map((item) => item.id), ["legacy", "free", "tuning"]);
  assert.deepEqual(filterMatchesByRecordType(matches, "tuning").map((item) => item.id), ["tuning"]);
});

test("changing away from challenge clears official event fields", () => {
  const session = sanitizeSessionForRecordType({
    recordType: "free",
    placement: "champion",
    placementNote: "優勝",
    randomPrizeWon: true,
    randomPrizeMethod: "rps",
    randomPrizeMethodNote: "3人",
    staffRpsHands: ["rock", "paper", "scissors"]
  });

  assert.deepEqual(session, {
    recordType: "free",
    placement: "",
    placementNote: "",
    randomPrizeWon: false,
    randomPrizeMethod: "",
    randomPrizeMethodNote: "",
    staffRpsHands: ["", "", ""]
  });
});

test("the app normalizes legacy sessions and enriches matches with record type", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /sanitizeSessionForRecordType\(\{/);
  assert.match(appSource, /recordType:\s*normalizeRecordType\(session\.recordType\)/);
  assert.match(appSource, /recordType:\s*normalizeRecordType\(session\?\.recordType\)/);
  assert.match(appSource, /recordType:\s*"challenge"/);
});

test("the session form selects a record type and hides challenge-only fields", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /data-session-record-type/);
  assert.match(appSource, /data-challenge-session-field/);
  assert.match(appSource, /syncSessionRecordTypeFields\(\)/);
  assert.match(appSource, /recordType:\s*normalizeRecordType\(data\.get\("recordType"\)\)/);
  assert.match(appSource, /const session = sanitizeSessionForRecordType\(\{/);
});

test("deck detail filters sessions behind three compact record type tabs", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);

  assert.match(appSource, /filterSessionsByRecordType\(sessionsForDeck\(deckId\), selectedRecordType\)/);
  assert.match(appSource, /data-deck-record-type/);
  assert.match(appSource, /deck-type-record-strip/);
  assert.match(appSource, /returnDeckRecordType/);
  assert.match(styles, /\.record-type-tabs/);
  assert.match(styles, /\.deck-type-record-strip/);
});

test("analysis and player screens share record type filters with challenge defaults", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);

  assert.match(appSource, /data-analysis-record-type/);
  assert.match(appSource, /data-player-record-type/);
  assert.match(appSource, /data-player-record-type-tab/);
  assert.match(appSource, /playerRecordType:\s*normalizeRecordType/);
  assert.match(appSource, /selectedPlayerRecordType === "all"/);
  assert.match(styles, /\.player-record-type-chip/);
  assert.match(styles, /\.record-type-tabs\.four/);
});

test("tournament archives stay challenge-only while admin can select a type", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /filterSessionsByRecordType\(state\.sessions, "challenge"\)/);
  assert.match(appSource, /data-admin-record-type/);
  assert.match(appSource, /adminRecordType/);
});
