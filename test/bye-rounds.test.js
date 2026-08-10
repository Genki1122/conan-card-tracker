import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  matchResultSelection,
  normalizeRoundRecord,
  roundFormState,
  sanitizeRoundRecord
} from "../src/rounds.js";

test("legacy match records remain played rounds", () => {
  const normalized = normalizeRoundRecord({
    id: "legacy",
    result: "win",
    firstPlayer: "first",
    opponentDeck: "青単"
  });

  assert.equal(normalized.roundType, "played");
  assert.equal(normalized.result, "win");
  assert.equal(normalized.firstPlayer, "first");
  assert.equal(normalized.opponentDeck, "青単");
});

test("a bye is saved as a win without fabricated opponent data", () => {
  const sanitized = sanitizeRoundRecord({
    roundType: "bye",
    result: "loss",
    firstPlayer: "second",
    opponentPlayer: "入力途中",
    opponentDeck: "赤単",
    opponentPartnerColor: "red",
    opponentCaseCardId: "case-card",
    opponentRps: "rock",
    myPassed: "pass1",
    opponentPassed: "pass2",
    memo: "入力途中"
  });

  assert.deepEqual(sanitized, {
    roundType: "bye",
    result: "win",
    firstPlayer: "",
    opponentPlayer: "",
    opponentDeck: "",
    opponentPartnerColor: "",
    opponentCaseCardId: "",
    opponentRps: "unknown",
    myPassed: "none",
    opponentPassed: "none",
    memo: ""
  });
});

test("the bye result selection collapses played-match fields", () => {
  assert.deepEqual(roundFormState("bye"), {
    isBye: true,
    roundType: "bye",
    result: "win",
    requiresTurn: false
  });
  assert.deepEqual(roundFormState("loss"), {
    isBye: false,
    roundType: "played",
    result: "loss",
    requiresTurn: true
  });
});

test("editing a bye selects the explicit bye option", () => {
  assert.equal(matchResultSelection({ roundType: "bye", result: "win" }), "bye");
  assert.equal(matchResultSelection({ result: "draw" }), "draw");
});

test("a new round with no editing record defaults to pending", () => {
  assert.equal(matchResultSelection(null), "pending");
});

test("the app exposes a compact bye form and official round labels", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);

  assert.match(appSource, /\["bye", "不戦勝"\]/);
  assert.match(appSource, /data-played-round-field/);
  assert.match(appSource, /data-bye-round-note/);
  assert.match(appSource, /syncRoundFormFields\(\)/);
  assert.match(appSource, /sanitizeRoundRecord\(\{/);
  assert.match(appSource, /return summarizeRounds\(matchesForSession\(sessionId\)\)/);
  assert.match(appSource, /\$\{rounds\.length\}ラウンド/);
  assert.match(appSource, /\$\{overall\.total\}試合/);
  assert.match(styles, /\.bye-round-note/);
});
