export function updateSessionDeck(state, { sessionId, deckId, deckVersion }) {
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) return state;
  return {
    ...state,
    sessions: state.sessions.map((session) => (
      session.id === sessionId ? { ...session, deckId, deckVersion } : session
    )),
    matches: state.matches.map((match) => (
      match.sessionId === sessionId ? { ...match, myDeck: deck.name } : match
    ))
  };
}

export function sortSessionsNewestFirst(sessions = []) {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const dateOrder = String(right.session.date || "").localeCompare(String(left.session.date || ""));
      if (dateOrder !== 0) return dateOrder;

      const leftCreatedAt = String(left.session.createdAt || "");
      const rightCreatedAt = String(right.session.createdAt || "");
      if (leftCreatedAt && rightCreatedAt) {
        const createdAtOrder = rightCreatedAt.localeCompare(leftCreatedAt);
        if (createdAtOrder !== 0) return createdAtOrder;
      }

      return right.index - left.index;
    })
    .map(({ session }) => session);
}

export function resolveSessionCreatedAt(currentSession, now) {
  if (currentSession) return String(currentSession.createdAt || "");
  return String(now || "");
}

export function sessionVersionOptions(state, deckId, selectedVersion = "") {
  const deck = state.decks.find((item) => item.id === deckId);
  const values = [
    selectedVersion,
    deck?.version,
    ...state.sessions
      .filter((session) => session.deckId === deckId)
      .map((session) => session.deckVersion)
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function mergeStoreName(state, from, to) {
  let affected = 0;
  const sessions = state.sessions.map((session) => {
    if (String(session.name || "").trim() !== from) return session;
    affected += 1;
    return { ...session, name: to };
  });
  return { state: { ...state, sessions }, affected };
}

export function renameEnvironmentInState(state, from, to) {
  const environments = [...new Set(
    (state.environments || []).map((name) => name === from ? to : name)
  )];
  return {
    ...state,
    environments,
    sessions: state.sessions.map((session) => (
      session.environment === from ? { ...session, environment: to } : session
    ))
  };
}

function playerNameWithoutHonorific(value) {
  const name = String(value || "").trim();
  const honorificIndex = name.indexOf("さん");
  if (honorificIndex <= 0) return name;
  return name.slice(0, honorificIndex + "さん".length).trim() || name;
}

export function previewPlayerNameHonorificTrim(state) {
  const changesByName = new Map();
  let affectedMatches = 0;

  for (const match of state.matches) {
    const from = String(match.opponentPlayer || "").trim();
    const to = playerNameWithoutHonorific(from);
    if (!from || from === to) continue;
    affectedMatches += 1;
    const current = changesByName.get(from) || { from, to, matches: 0 };
    current.matches += 1;
    changesByName.set(from, current);
  }

  const changes = [...changesByName.values()]
    .sort((a, b) => b.matches - a.matches);
  return {
    totalMatches: state.matches.length,
    affectedMatches,
    affectedNames: changes.length,
    changes
  };
}

export function trimPlayerNamesAtHonorific(state) {
  let affected = 0;
  const matches = state.matches.map((match) => {
    const name = String(match.opponentPlayer || "").trim();
    const nextName = playerNameWithoutHonorific(name);
    if (nextName === name) return match;
    affected += 1;
    return { ...match, opponentPlayer: nextName };
  });
  return { state: { ...state, matches }, affected };
}
