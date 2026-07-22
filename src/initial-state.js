export function createInitialState() {
  return {
    decks: [],
    sessions: [],
    environments: [],
    matches: []
  };
}

export function removeLegacyMockState(state) {
  const deckIds = new Set((state?.decks || []).map((deck) => deck.id));
  const sessionIds = new Set((state?.sessions || []).map((session) => session.id));
  const onlyMockDecks = deckIds.size === 2 && deckIds.has("deck-takagi") && deckIds.has("deck-conan");
  const onlyMockSessions = sessionIds.size === 2 && sessionIds.has("session-1") && sessionIds.has("session-2");
  const onlyMockMatches = (state?.matches || []).every((match) => sessionIds.has(match.sessionId));
  return onlyMockDecks && onlyMockSessions && onlyMockMatches ? createInitialState() : state;
}
