export function replaceWithPlayerNameSuggestion(_currentValue, suggestion) {
  return String(suggestion || "").trim();
}

export function filterPlayerNameSuggestions(names = [], query = "", limit = 5) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("ja");
  if (!normalizedQuery || normalizedQuery === "不明") return [];

  const uniqueNames = [...new Set(
    names.map((name) => String(name || "").trim()).filter(Boolean)
  )];
  return uniqueNames
    .filter((name) => name.toLocaleLowerCase("ja") !== normalizedQuery)
    .filter((name) => name.toLocaleLowerCase("ja").includes(normalizedQuery))
    .sort((a, b) => {
      const aStarts = a.toLocaleLowerCase("ja").startsWith(normalizedQuery);
      const bStarts = b.toLocaleLowerCase("ja").startsWith(normalizedQuery);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.localeCompare(b, "ja");
    })
    .slice(0, limit);
}
