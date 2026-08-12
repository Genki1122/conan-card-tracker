import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterMatchupRecords,
  matchupGroupName,
  passBadgeItems
} from "../src/matchup-detail.js";

const matches = [
  {
    id: "new-loss",
    date: "2026-08-08",
    opponentDeck: "疾風",
    opponentColor: "黄",
    result: "loss",
    firstPlayer: "first",
    myPassed: "pass12",
    opponentPassed: "pass1"
  },
  {
    id: "old-win",
    date: "2026-08-01",
    opponentDeck: "疾風",
    opponentColor: "黄",
    result: "win",
    firstPlayer: "second",
    myPassed: "none",
    opponentPassed: "pass2"
  },
  {
    id: "other",
    date: "2026-08-09",
    opponentDeck: "白黄前髪",
    opponentColor: "白",
    result: "loss",
    firstPlayer: "first"
  }
];

describe("matchup detail filtering", () => {
  it("filters by aggregation row, result, and turn together", () => {
    assert.deepEqual(
      filterMatchupRecords(matches, {
        pivot: "opponentDeck",
        name: "疾風",
        result: "loss",
        turn: "first"
      }).map((match) => match.id),
      ["new-loss"]
    );
  });

  it("returns all row matches newest first when detail filters are unset", () => {
    assert.deepEqual(
      filterMatchupRecords(matches, { pivot: "opponentDeck", name: "疾風" })
        .map((match) => match.id),
      ["new-loss", "old-win"]
    );
  });

  it("uses the same month and unrecorded grouping labels as cross aggregation", () => {
    assert.equal(matchupGroupName({ date: "2026-08-08" }, "month"), "2026-08");
    assert.equal(matchupGroupName({ opponentDeck: "" }, "opponentDeck"), "未設定");
  });
});

describe("pass badges", () => {
  it("distinguishes self and opponent passes without relying on color", () => {
    assert.deepEqual(passBadgeItems(matches[0]), [
      { kind: "self", label: "1&2パス" },
      { kind: "opponent", label: "被1パス" }
    ]);
  });

  it("omits no-pass and legacy false values", () => {
    assert.deepEqual(passBadgeItems({ myPassed: "none", opponentPassed: false }), []);
  });
});
