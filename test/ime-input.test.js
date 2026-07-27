import test from "node:test";
import assert from "node:assert/strict";

import { shouldUpdateSearchFromInput } from "../src/ime-input.js";

test("does not update search results while Japanese IME composition is active", () => {
  assert.equal(shouldUpdateSearchFromInput({ isComposing: true, inputType: "insertCompositionText" }), false);
});

test("updates search results after IME composition is committed", () => {
  assert.equal(shouldUpdateSearchFromInput({ isComposing: false, inputType: "insertText" }), true);
});
