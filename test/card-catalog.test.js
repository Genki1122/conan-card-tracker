import test from "node:test";
import assert from "node:assert/strict";

import {
  caseCards,
  caseCardColorLabel,
  caseCardsForPartnerColor,
  findCaseCardByName,
  getCaseCard,
  isCaseCardAvailableForPartnerColor,
  partnerColors
} from "../src/card-catalog.js";

// Official CT-P11 list, checked 2026-10-29. Parallel prints share the same card ID.
const showTimeCases = [
  { number: "B11094", id: "dry-martini", name: "ドライマティーニ", colors: ["black"], label: "黒" },
  { number: "B11098", id: "conan-vs-kaito-kid", name: "コナンVS怪盗キッド", colors: ["blue", "white"], label: "青/白" },
  { number: "B11099", id: "who-are-you", name: "あんた何者や", colors: ["green", "red"], label: "緑/赤" },
  { number: "B11100", id: "mpd-public-security-undercover", name: "警視庁公安部の潜入捜査官", colors: ["yellow", "black"], label: "黄/黒" }
];

for (const expected of showTimeCases) {
  test(`registers CT-P11 ${expected.number} once with the official name and colors`, () => {
    const card = getCaseCard(expected.id);
    assert.ok(card, expected.name);
    assert.equal(card.name, expected.name);
    assert.deepEqual(card.colors, expected.colors);
    assert.equal(findCaseCardByName(expected.name), card);
    assert.equal(caseCards.filter(item => item.name === expected.name).length, 1);
    assert.equal(caseCardColorLabel(card), expected.label);
    for (const { id: color } of partnerColors) {
      const available = expected.colors.includes(color);
      assert.equal(isCaseCardAvailableForPartnerColor(card.id, color), available, color);
      assert.equal(caseCardsForPartnerColor(color).filter(item => item.id === card.id).length, available ? 1 : 0, color);
    }
  });
}

test("keeps catalog IDs unique and ranks new case cards by usage", () => {
  assert.equal(new Set(caseCards.map(card => card.id)).size, caseCards.length);
  const cards = caseCardsForPartnerColor("black", new Map([
    ["dry-martini", 1], ["mpd-public-security-undercover", 5], ["black-impact", 3]
  ]));
  assert.deepEqual(cards.slice(0, 3).map(card => card.id), [
    "mpd-public-security-undercover", "black-impact", "dry-martini"
  ]);
});

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

test("ranks case cards only by usage regardless of color combination", () => {
  const cards = caseCardsForPartnerColor("yellow", {
    "captured-detective": 1,
    "pasture-embers": 7,
    "gathered-detectives": 12
  });
  const names = cards.map((card) => card.name);

  assert.ok(names.indexOf("集められた名探偵") < names.indexOf("牧場に堕ちた火種"));
  assert.ok(names.indexOf("牧場に堕ちた火種") < names.indexOf("囚われた刑事"));
});

test("uses Japanese name order for equal usage without color grouping", () => {
  const names = caseCardsForPartnerColor("yellow").map((card) => card.name);
  const alphabetical = [...names].sort((left, right) => left.localeCompare(right, "ja"));

  assert.deepEqual(names, alphabetical);
});
