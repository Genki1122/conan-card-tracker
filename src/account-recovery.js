const UNKNOWN_VALUES = new Set(["", "不明", "未設定", "未登録", "unknown"]);

export function hasAccountRecords(state = {}) {
  return ["decks", "sessions", "matches"].some((key) => (state[key] || []).length > 0);
}

export function recoverySummary(state = {}) {
  return {
    decks: (state.decks || []).length,
    sessions: (state.sessions || []).length,
    matches: (state.matches || []).length
  };
}

export function mergeAccountStates(accountState = {}, anonymousState = {}, options = {}) {
  const account = normalizedState(accountState);
  const anonymous = applyDuplicateChoices(
    normalizedState(anonymousState),
    options.sameRecordPairs || []
  );
  const decks = mergeEntities(account.decks, anonymous.decks);
  const sessions = mergeEntities(account.sessions, anonymous.sessions);
  const matches = mergeEntities(account.matches, anonymous.matches);
  const state = {
    ...account,
    decks,
    sessions,
    environments: [...new Set([...account.environments, ...anonymous.environments])],
    matches
  };

  return {
    state,
    account: recoverySummary(account),
    anonymous: recoverySummary(anonymous),
    merged: recoverySummary(state),
    added: {
      decks: decks.length - account.decks.length,
      sessions: sessions.length - account.sessions.length,
      matches: matches.length - account.matches.length
    },
    ambiguous: [
      ...ambiguousPairs("deck", account.decks, anonymous.decks, deckFingerprint),
      ...ambiguousPairs("session", account.sessions, anonymous.sessions, sessionFingerprint),
      ...ambiguousPairs("match", account.matches, anonymous.matches, matchFingerprint)
    ]
  };
}

function applyDuplicateChoices(anonymous, pairs) {
  const deckIds = idRemap(pairs, "deck");
  const sessionIds = idRemap(pairs, "session");
  const matchIds = idRemap(pairs, "match");
  return {
    ...anonymous,
    decks: anonymous.decks.map((deck) => ({
      ...deck,
      id: deckIds.get(deck.id) || deck.id
    })),
    sessions: anonymous.sessions.map((session) => ({
      ...session,
      id: sessionIds.get(session.id) || session.id,
      deckId: deckIds.get(session.deckId) || session.deckId
    })),
    matches: anonymous.matches.map((match) => ({
      ...match,
      id: matchIds.get(match.id) || match.id,
      sessionId: sessionIds.get(match.sessionId) || match.sessionId
    }))
  };
}

function idRemap(pairs, type) {
  return new Map(pairs
    .filter((pair) => pair.type === type)
    .map((pair) => [pair.anonymousId, pair.accountId]));
}

function normalizedState(value) {
  return {
    ...clone(value || {}),
    decks: clone(value?.decks || []),
    sessions: clone(value?.sessions || []),
    environments: clone(value?.environments || []),
    matches: clone(value?.matches || [])
  };
}

function mergeEntities(accountItems, anonymousItems) {
  const rows = new Map(accountItems.map((item) => [item.id, clone(item)]));
  anonymousItems.forEach((item) => {
    if (!item?.id || !rows.has(item.id)) {
      rows.set(item.id, clone(item));
      return;
    }
    rows.set(item.id, fillMissing(rows.get(item.id), item));
  });
  return [...rows.values()];
}

function fillMissing(preferred, fallback) {
  const merged = clone(preferred);
  Object.entries(fallback || {}).forEach(([key, value]) => {
    if (isMissing(merged[key]) && !isMissing(value)) merged[key] = clone(value);
  });
  return merged;
}

function isMissing(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return UNKNOWN_VALUES.has(value.trim());
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function ambiguousPairs(type, accountItems, anonymousItems, fingerprintOf) {
  const accountByFingerprint = new Map();
  accountItems.forEach((item) => {
    const fingerprint = fingerprintOf(item);
    if (!fingerprint) return;
    const rows = accountByFingerprint.get(fingerprint) || [];
    rows.push(item);
    accountByFingerprint.set(fingerprint, rows);
  });

  return anonymousItems.flatMap((anonymous) => {
    const fingerprint = fingerprintOf(anonymous);
    if (!fingerprint) return [];
    return (accountByFingerprint.get(fingerprint) || [])
      .filter((account) => account.id !== anonymous.id)
      .map((account) => ({
        type,
        accountId: account.id,
        anonymousId: anonymous.id,
        label: ambiguityLabel(type, anonymous)
      }));
  });
}

function deckFingerprint(deck = {}) {
  return fingerprint([deck.name, deck.version]);
}

function sessionFingerprint(session = {}) {
  return fingerprint([session.date, session.name, session.format, session.environment]);
}

function matchFingerprint(match = {}) {
  return fingerprint([
    match.sessionId,
    match.myDeck,
    match.opponentDeck,
    match.opponentPlayer,
    match.result,
    match.firstPlayer,
    match.opponentRps,
    match.myPassed,
    match.opponentPassed
  ]);
}

function fingerprint(values) {
  const normalized = values.map((value) => String(value || "").trim().toLocaleLowerCase("ja"));
  return normalized.some(Boolean) ? normalized.join("\u001f") : "";
}

function ambiguityLabel(type, item) {
  if (type === "deck") return item.name || "名称未設定";
  if (type === "session") return [item.date, item.name].filter(Boolean).join(" ") || "大会情報未設定";
  return [item.opponentPlayer, item.opponentDeck].filter((value) => !isMissing(value)).join(" / ") || "対戦情報未設定";
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}
