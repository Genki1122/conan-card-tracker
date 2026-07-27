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
