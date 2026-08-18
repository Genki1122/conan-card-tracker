import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionShareText,
  buildXShareUrl,
  isSessionShareAvailable
} from "../src/session-share.js";

test("X sharing is available only for challenge sessions", () => {
  assert.equal(isSessionShareAvailable({}), true);
  assert.equal(isSessionShareAvailable({ recordType: "challenge" }), true);
  assert.equal(isSessionShareAvailable({ recordType: "free" }), false);
  assert.equal(isSessionShareAvailable({ recordType: "tuning" }), false);
});

test("builds a compact aligned X post from a completed session", () => {
  const text = buildSessionShareText({
    session: {
      name: "コナンチャレンジ戦 カードボックス川口",
      placement: "second",
      randomPrizeWon: true
    },
    deck: { name: "鬼丸剣道" },
    matches: [
      {
        opponentDeck: "白単",
        opponentCaseCardId: "",
        opponentPartnerColor: "white",
        firstPlayer: "second",
        result: "win"
      },
      {
        opponentDeck: "不明",
        opponentCaseCardId: "love-deduction-kendo",
        opponentPartnerColor: "green",
        firstPlayer: "first",
        result: "loss"
      }
    ]
  });

  assert.equal(text, [
    "コナンチャレンジ戦 カードボックス川口",
    "使用　鬼丸剣道",
    "結果　1-1　2位・ランダム賞",
    "",
    "後 ○｜白単",
    "先 × ｜恋と推理の剣道大会"
  ].join("\n"));
  assert.equal(text.includes("#コナンカード"), false);
});

test("does not display a random prize alongside a championship", () => {
  const text = buildSessionShareText({
    session: {
      name: "ショップ大会",
      placement: "champion",
      randomPrizeWon: true
    },
    deck: { name: "青コナン" },
    matches: [{ opponentDeck: "赤単", firstPlayer: "second", result: "draw" }]
  });

  assert.equal(text.includes("結果　0-0-1　優勝"), true);
  assert.equal(text.includes("ランダム賞"), false);
});

test("does not include pending matches in the record or round list", () => {
  const text = buildSessionShareText({
    session: { name: "ショップ大会" },
    deck: { name: "鬼丸剣道" },
    matches: [
      { opponentDeck: "高佐", firstPlayer: "second", result: "win" },
      { opponentDeck: "FBI", firstPlayer: "first", result: "pending" }
    ]
  });

  assert.equal(text.includes("結果　1-0"), true);
  assert.equal(text.includes("高佐"), true);
  assert.equal(text.includes("FBI"), false);
});

test("adds recorded passes as a compact suffix without changing no-pass rows", () => {
  const text = buildSessionShareText({
    session: { name: "ショップ大会" },
    deck: { name: "鬼丸剣道" },
    matches: [
      { opponentDeck: "白単", firstPlayer: "second", result: "win", myPassed: "none", opponentPassed: "none" },
      { opponentDeck: "疾風", firstPlayer: "first", result: "loss", myPassed: "pass1", opponentPassed: "none" },
      { opponentDeck: "高佐", firstPlayer: "second", result: "win", myPassed: "none", opponentPassed: "pass1" },
      { opponentDeck: "FBI", firstPlayer: "first", result: "draw", myPassed: "pass12", opponentPassed: "pass2" }
    ]
  });

  assert.equal(text.includes("後 ○｜白単\n"), true);
  assert.equal(text.includes("先 × ｜疾風｜1パス"), true);
  assert.equal(text.includes("後 ○｜高佐｜被1パス"), true);
  assert.equal(text.includes("先 △｜FBI｜1&2パス・被2パス"), true);
  assert.equal(text.includes("パス無"), false);
});

test("counts a bye in the official record and labels its round explicitly", () => {
  const text = buildSessionShareText({
    session: { name: "ショップ大会" },
    deck: { name: "鬼丸剣道" },
    matches: [
      { opponentDeck: "高佐", firstPlayer: "second", result: "loss", roundType: "played" },
      { opponentDeck: "", firstPlayer: "", result: "win", roundType: "bye", myPassed: "pass1", opponentPassed: "pass2" }
    ]
  });

  assert.equal(text.includes("結果　1-1"), true);
  assert.equal(text.includes("－ ○｜不戦勝"), true);
  assert.equal(text.includes("｜不明"), false);
  assert.equal(text.includes("不戦勝｜"), false);
});

test("creates an editable X compose URL with the generated text", () => {
  const url = new URL(buildXShareUrl("結果　3-1\n後 ○｜白単"));

  assert.equal(url.origin, "https://twitter.com");
  assert.equal(url.pathname, "/intent/tweet");
  assert.equal(url.searchParams.get("text"), "結果　3-1\n後 ○｜白単");
});
