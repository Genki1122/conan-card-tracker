export const sessionRecordTypes = ["challenge", "free", "tuning"];

const labels = {
  challenge: "チャレンジ戦",
  free: "フリー対戦",
  tuning: "調整対戦",
  all: "すべて"
};

export function normalizeRecordType(value, { allowAll = false } = {}) {
  if (allowAll && value === "all") return "all";
  return sessionRecordTypes.includes(value) ? value : "challenge";
}

export function recordTypeLabel(value) {
  const normalized = normalizeRecordType(value, { allowAll: true });
  return labels[normalized];
}

export function filterSessionsByRecordType(sessions = [], value = "challenge") {
  const selected = normalizeRecordType(value, { allowAll: true });
  if (selected === "all") return [...sessions];
  return sessions.filter((session) => normalizeRecordType(session.recordType) === selected);
}

export function filterMatchesByRecordType(matches = [], value = "challenge") {
  const selected = normalizeRecordType(value, { allowAll: true });
  if (selected === "all") return [...matches];
  return matches.filter((match) => normalizeRecordType(match.recordType) === selected);
}

export function sanitizeSessionForRecordType(session = {}) {
  const recordType = normalizeRecordType(session.recordType);
  if (recordType === "challenge") return { ...session, recordType };
  return {
    ...session,
    recordType,
    placement: "",
    placementNote: "",
    randomPrizeWon: false,
    randomPrizeMethod: "",
    randomPrizeMethodNote: "",
    staffRpsHands: ["", "", ""]
  };
}
