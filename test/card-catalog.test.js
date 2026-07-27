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
