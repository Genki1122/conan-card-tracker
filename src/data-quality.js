export const qualityFields = [
  { key: "opponentPlayer", label: "プレイヤー名" },
  { key: "opponentDeck", label: "相手デッキ" },
  { key: "myColor", label: "自分の色" },
  { key: "opponentColor", label: "相手の色" },
  { key: "myCaseCard", label: "自分の事件カード" },
  { key: "opponentCaseCard", label: "相手の事件カード" },
  { key: "environment", label: "環境" }
];

export function missingQualityFields(match = {}, session = {}, deck = {}) {
  if (match.roundType === "bye") return [];
  return qualityFields
    .filter((field) => !isRecorded(field.key, {
      ...match,
      myPartnerColor: session.partnerColor || deck.partnerColor || "",
      myCaseCardId: session.caseCardId || deck.caseCardId || "",
      environment: session.environment || ""
    }))
    .map((field) => field.key);
}

export function buildRepairQueue(state = {}, field = "") {
  const decks = new Map((state.decks || []).map((deck) => [deck.id, deck]));
  const sessions = new Map((state.sessions || []).map((session) => [session.id, session]));
  return (state.matches || [])
    .map((match, index) => {
      const session = sessions.get(match.sessionId) || {};
      const deck = decks.get(session.deckId) || {};
      return {
        match,
        session,
        deck,
        index,
        missingFields: missingQualityFields(match, session, deck)
      };
    })
    .filter((item) => item.missingFields.length > 0 && (!field || item.missingFields.includes(field)))
    .sort((left, right) => (
      String(right.session.date || "").localeCompare(String(left.session.date || ""))
      || right.index - left.index
    ));
}

export function qualityRows(records = []) {
  return qualityFields.map((field) => {
    const missingRecords = records.filter((record) => !isRecorded(field.key, record));
    const affected = new Map();
    missingRecords.forEach((record) => {
      if (!record.userId) return;
      affected.set(record.userId, (affected.get(record.userId) || 0) + 1);
    });
    const recorded = records.length - missingRecords.length;
    return {
      key: field.key,
      label: field.label,
      recorded,
      missing: missingRecords.length,
      rate: rate(recorded, records.length),
      affectedUsers: [...affected.entries()]
        .map(([userId, missing]) => ({ userId, missing }))
        .sort((left, right) => right.missing - left.missing || left.userId.localeCompare(right.userId))
    };
  });
}

export function qualityFieldLabel(key) {
  return qualityFields.find((field) => field.key === key)?.label || "未記録項目";
}

export function repairTargetForFields(fields = [], selectedField = "") {
  const field = selectedField || fields[0] || "";
  return ["myColor", "myCaseCard", "environment"].includes(field) ? "session" : "match";
}

function isRecorded(key, record) {
  if (key === "opponentPlayer") {
    return typeof record.opponentPlayerRecorded === "boolean"
      ? record.opponentPlayerRecorded
      : knownValue(record.opponentPlayer, ["未登録"]);
  }
  if (key === "opponentDeck") return knownValue(record.opponentDeck, ["不明", "未設定"]);
  if (key === "myColor") return knownValue(record.myPartnerColor);
  if (key === "opponentColor") return knownValue(record.opponentPartnerColor);
  if (key === "myCaseCard") return knownValue(record.myCaseCardId);
  if (key === "opponentCaseCard") return knownValue(record.opponentCaseCardId);
  if (key === "environment") return knownValue(record.environment, ["未設定"]);
  return true;
}

function knownValue(value, unknownValues = []) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && !unknownValues.includes(normalized);
}

function rate(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}
