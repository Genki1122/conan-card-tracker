function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

export function statesEqual(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function stateSummary(state = {}) {
  return {
    decks: Array.isArray(state.decks) ? state.decks.length : 0,
    sessions: Array.isArray(state.sessions) ? state.sessions.length : 0,
    matches: Array.isArray(state.matches) ? state.matches.length : 0
  };
}
