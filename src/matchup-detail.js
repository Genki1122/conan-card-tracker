const passLabels = {
  pass1: "1パス",
  pass2: "2パス",
  pass3: "3パス",
  pass12: "1&2パス",
  true: "パス有"
};

const validResults = new Set(["win", "loss", "draw"]);
const validTurns = new Set(["first", "second"]);

export function matchupGroupName(match, pivot) {
  if (pivot === "month") return String(match?.date || "").slice(0, 7) || "未設定";
  return String(match?.[pivot] || "").trim() || "未設定";
}

export function filterMatchupRecords(matches, {
  pivot,
  name,
  result = "all",
  turn = "all"
} = {}) {
  const selectedResult = validResults.has(result) ? result : "all";
  const selectedTurn = validTurns.has(turn) ? turn : "all";

  return [...matches]
    .filter((match) => matchupGroupName(match, pivot) === name)
    .filter((match) => selectedResult === "all" || match.result === selectedResult)
    .filter((match) => selectedTurn === "all" || match.firstPlayer === selectedTurn)
    .sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || ""))
      || Number(b.order || 0) - Number(a.order || 0)
      || String(b.id || "").localeCompare(String(a.id || ""))
    ));
}

export function passBadgeItems(match) {
  const items = [];
  const selfLabel = passLabels[String(match?.myPassed)];
  const opponentLabel = passLabels[String(match?.opponentPassed)];

  if (selfLabel) items.push({ kind: "self", label: selfLabel });
  if (opponentLabel) items.push({ kind: "opponent", label: `被${opponentLabel}` });
  return items;
}
