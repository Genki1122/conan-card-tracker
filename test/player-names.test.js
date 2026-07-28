import test from "node:test";
import assert from "node:assert/strict";

import {
  filterPlayerNameSuggestions,
  replaceWithPlayerNameSuggestion
} from "../src/player-names.js";

test("selecting a player suggestion replaces the entire composing value", () => {
  assert.equal(
    replaceWithPlayerNameSuggestion("プレイヤーAさん入力中", "プレイヤーAさん"),
    "プレイヤーAさん"
  );
});

test("player suggestions prioritize names that begin with the current input", () => {
  assert.deepEqual(
    filterPlayerNameSuggestions(
      ["佐藤さん", "とけいさん", "とまとさん", "みとさん"],
      "と"
    ),
    ["とけいさん", "とまとさん", "みとさん"]
  );
});
