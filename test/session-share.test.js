import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionShareText,
  buildXShareUrl
} from "../src/session-share.js";

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

test("creates an editable X compose URL with the generated text", () => {
  const url = new URL(buildXShareUrl("結果　3-1\n後 ○｜白単"));

  assert.equal(url.origin, "https://twitter.com");
  assert.equal(url.pathname, "/intent/tweet");
  assert.equal(url.searchParams.get("text"), "結果　3-1\n後 ○｜白単");
});
