const resultValues = new Set(["pending", "win", "loss", "draw"]);

export function normalizeRoundType(value) {
  return value === "bye" ? "bye" : "played";
}

export function roundFormState(selection = "pending") {
  const isBye = selection === "bye";
  return {
    isBye,
    roundType: isBye ? "bye" : "played",
    result: isBye ? "win" : resultValues.has(selection) ? selection : "pending",
    requiresTurn: !isBye
  };
}

export function matchResultSelection(match = {}) {
  const record = match || {};
  if (normalizeRoundType(record.roundType) === "bye") return "bye";
  return resultValues.has(record.result) ? record.result : "pending";
}

export function sanitizeRoundRecord(record = {}) {
  const roundType = normalizeRoundType(record.roundType);
  if (roundType !== "bye") {
    return {
      ...record,
      roundType,
      result: resultValues.has(record.result) ? record.result : "pending"
    };
  }

  return {
    ...record,
    roundType: "bye",
    result: "win",
    firstPlayer: "",
    opponentPlayer: "",
    opponentDeck: "",
    opponentPartnerColor: "",
    opponentCaseCardId: "",
    opponentRps: "unknown",
    myPassed: "none",
    opponentPassed: "none",
    memo: ""
  };
}

export function normalizeRoundRecord(record = {}) {
  return sanitizeRoundRecord(record);
}
