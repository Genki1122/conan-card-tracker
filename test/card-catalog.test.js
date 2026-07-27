import test from "node:test";
import assert from "node:assert/strict";

import {
  caseCardsForPartnerColor,
  findCaseCardByName,
  isCaseCardAvailableForPartnerColor,
  partnerColors
} from "../src/card-catalog.js";

test("provides the six Conan Card Game partner colors", () => {
  assert.deepEqual(
    partnerColors.map((color) => color.id),
    ["blue", "green", "white", "red", "yellow", "black"]
  );
});

test("filters case cards by partner color and shares multicolor cards", () => {
  const blueNames = caseCardsForPartnerColor("blue").map((card) => card.name);
  const greenNames = caseCardsForPartnerColor("green").map((card) => card.name);

  assert.equal(blueNames.includes("平成のホームズ"), true);
  assert.equal(blueNames.includes("浪花の連続殺人事件"), false);
  assert.equal(greenNames.includes("浪花の連続殺人事件"), true);
  assert.equal(greenNames.includes("平成のホームズ"), false);
  assert.equal(blueNames.includes("外交官殺人事件"), true);
  assert.equal(greenNames.includes("外交官殺人事件"), true);
  assert.equal(blueNames.includes("集められた名探偵"), true);
  assert.equal(greenNames.includes("集められた名探偵"), true);
});

test("validates a selected case card against the selected partner color", () => {
  const blueCase = findCaseCardByName("平成のホームズ");
  const sharedCase = findCaseCardByName("外交官殺人事件");

  assert.equal(isCaseCardAvailableForPartnerColor(blueCase.id, "blue"), true);
  assert.equal(isCaseCardAvailableForPartnerColor(blueCase.id, "green"), false);
  assert.equal(isCaseCardAvailableForPartnerColor(sharedCase.id, "blue"), true);
  assert.equal(isCaseCardAvailableForPartnerColor(sharedCase.id, "green"), true);
});

test("provides case cards for white, red, yellow, and black partners", () => {
  const expectedByColor = {
    white: ["怪盗キッドの瞬間移動魔術", "コナンvsキッド 赤面の人魚", "漆黒の特急"],
    red: ["緋色の帰還", "赤女の悲劇", "愛しい愛しい⋯宿敵さん"],
    yellow: ["囚われた刑事", "怪盗キッドと四名画", "裏切りの矛先"],
    black: ["あばよ⋯名探偵!!", "ブラックインパクト!", "犯人たちの犯行"]
  };

  Object.entries(expectedByColor).forEach(([color, expectedNames]) => {
    const names = caseCardsForPartnerColor(color).map((card) => card.name);
    expectedNames.forEach((name) => assert.equal(names.includes(name), true, `${color}: ${name}`));
  });
});

test("stores shared case cards once while exposing them to both partner colors", () => {
  const sharedNames = [
    "怪盗キッドの絡繰箱",
    "怪盗キッドと四名画",
    "裏切りの矛先",
    "愛しい愛しい⋯宿敵さん"
  ];

  sharedNames.forEach((name) => {
    const card = findCaseCardByName(name);
    assert.ok(card, name);
    assert.equal(new Set(card.colors).size, card.colors.length);
  });
});

test("ranks frequently selected case cards higher within the same color group", () => {
  const cards = caseCardsForPartnerColor("blue", {
    "pro-soccer-player-threat": 5,
    "diplomat-murder": 20
  });
  const names = cards.map((card) => card.name);

  assert.ok(names.indexOf("プロサッカー選手脅迫事件") < names.indexOf("平成のホームズ"));
  assert.ok(names.indexOf("外交官殺人事件") < names.indexOf("どっちの推理ショー"));
  assert.ok(names.indexOf("平成のホームズ") < names.indexOf("外交官殺人事件"));
});
