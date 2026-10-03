import assert from "node:assert/strict";
import test from "node:test";
import * as features from "../src/feature-releases.js";
import { passBadgeItems } from "../src/matchup-detail.js";
import { getMyPassUsage, filterMatchesWithoutPasses } from "../src/analytics.js";
import { buildSessionShareText } from "../src/session-share.js";

test("pass selections round-trip without inventing numbers for legacy data", async () => {
  const passes = await import("../src/pass-selection.js").catch(() => ({}));
  assert.equal(typeof passes.passValueFromNumbers, "function", "pass selection serializer must exist");
  for (const value of ["none", "pass1", "pass2", "pass3", "pass12", "pass13", "pass23", "pass123"]) {
    assert.equal(passes.passValueFromNumbers(passes.selectedPassNumbers(value)), value);
  }
  assert.equal(passes.passValueFromNumbers(["3", "2", "2", "9"]), "pass23");
  for (const value of [true, "true", false, "false", null, undefined]) {
    assert.deepEqual(passes.selectedPassNumbers(value), []);
  }
  const legacy = passes.passFieldMarkup({ name: "myPassed", label: "自分のパス", value: true, multiple: true });
  assert.match(legacy, /name="myPassed" value="true"/);
  assert.match(legacy, /data-pass-legacy/);
  assert.doesNotMatch(legacy, / checked/);
  const standard = passes.passFieldMarkup({ name: "myPassed", label: "自分のパス" });
  assert.match(standard, /<select/);
  assert.doesNotMatch(standard, /pass23|pass13|pass123|type="checkbox"/);
  const imported = passes.passFieldMarkup({ name: "myPassed", label: "自分のパス", value: "pass23" });
  assert.match(imported, /value="pass23" selected/);
});

test("new combinations keep the existing X suffix and indentation", () => {
  const text = buildSessionShareText({ session: { name: "テスト大会" }, deck: { name: "テストデッキ" }, matches: [
    { opponentDeck: "相手デッキ", result: "loss", firstPlayer: "first", myPassed: "pass23", opponentPassed: "pass123" }
  ] });
  assert.ok(text.includes("先 × ｜相手デッキ｜2&3パス・被1&2&3パス"));
});

test("multi-pass input is public while viewing another account stays read-only", () => {
  assert.equal(typeof features.canUsePassPicker, "function");
  assert.equal(features.canUsePassPicker({ signedIn: true, role: "superadmin" }), true);
  assert.equal(features.canUsePassPicker({ signedIn: false, role: "superadmin" }), true);
  assert.equal(features.canUsePassPicker({ signedIn: true, role: "" }), true);
  assert.equal(features.canUsePassPicker({ signedIn: false, role: "" }), true);
  assert.equal(features.canUsePassPicker({ signedIn: true, role: "superadmin", adminPreview: true }), false);
  assert.equal(features.canUsePassPicker(), true);
});

test("every combination is displayed in pass badges", () => {
  for (const [value, label] of [["pass13", "1&3パス"], ["pass23", "2&3パス"], ["pass123", "1&2&3パス"]]) {
    assert.deepEqual(passBadgeItems({ myPassed: value, opponentPassed: value }), [
      { kind: "self", label }, { kind: "opponent", label: `被${label}` }
    ]);
  }
  assert.deepEqual(passBadgeItems({ myPassed: true, opponentPassed: false }), [{ kind: "self", label: "パス有" }]);
});

test("multiple passes count as one passed match, and exclusion checks both players", () => {
  const matches = [
    { id: "two", result: "win", myPassed: "pass23", opponentPassed: "none" },
    { id: "three", result: "loss", myPassed: "pass123", opponentPassed: "pass13" },
    { id: "opponent", result: "win", myPassed: "none", opponentPassed: "pass23" },
    { id: "none", result: "win", myPassed: "none", opponentPassed: "none" },
    { id: "pending", result: "pending", myPassed: "pass23" },
    { id: "bye", result: "win", roundType: "bye", myPassed: "pass23" }
  ];
  assert.deepEqual(getMyPassUsage(matches), { used: 2, total: 4, rate: 50 });
  assert.deepEqual(filterMatchesWithoutPasses(matches).map(match => match.id), ["none"]);
});
