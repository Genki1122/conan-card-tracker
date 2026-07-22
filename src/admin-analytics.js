export function buildAdminOverview(input, now = new Date()) {
  const profiles = input.profiles || [];
  const states = input.states || [];
  const consentedUsers = new Set((input.consents || []).filter(isAiEligible).map((row) => row.user_id));
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const statesByUser = new Map(states.map((row) => [row.user_id, row]));
  const activityCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const allMatches = states.flatMap((row) => row.data?.matches || []);

  const userIds = [...new Set([...profiles.map((profile) => profile.user_id), ...states.map((row) => row.user_id)])];
  const userRows = userIds.map((userId) => {
    const row = statesByUser.get(userId) || { user_id: userId, data: {}, updated_at: "" };
    const profile = profilesByUser.get(userId) || {};
    const matches = row.data?.matches || [];
    const wins = matches.filter((match) => match.result === "win").length;
    const losses = matches.filter((match) => match.result === "loss").length;
    const draws = matches.filter((match) => match.result === "draw").length;
    return {
      userId: row.user_id,
      username: profile.username || "未設定",
      decks: row.data?.decks?.length || 0,
      sessions: row.data?.sessions?.length || 0,
      matches: matches.length,
      wins,
      losses,
      draws,
      winRate: rate(wins, matches.length),
      lastUpdated: row.updated_at || "",
      consented: consentedUsers.has(row.user_id)
    };
  }).sort((a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated)));

  const wins = allMatches.filter((match) => match.result === "win").length;
  return {
    users: profiles.length,
    activeUsers30d: states.filter((row) => new Date(row.updated_at).getTime() >= activityCutoff).length,
    decks: states.reduce((sum, row) => sum + (row.data?.decks?.length || 0), 0),
    sessions: states.reduce((sum, row) => sum + (row.data?.sessions?.length || 0), 0),
    matches: allMatches.length,
    winRate: rate(wins, allMatches.length),
    aiEligibleUsers: consentedUsers.size,
    userRows,
    myDecks: groupedMatches(allMatches, (match) => match.myDeck),
    opponentDecks: groupedMatches(allMatches, (match) => match.opponentDeck),
    environments: groupedEnvironments(states)
  };
}

export function buildAiTrainingDataset(input) {
  const consentedUsers = new Set((input.consents || []).filter(isAiEligible).map((row) => row.user_id));
  return (input.states || [])
    .filter((row) => consentedUsers.has(row.user_id))
    .flatMap((row) => {
      const sessions = new Map((row.data?.sessions || []).map((session) => [session.id, session]));
      return (row.data?.matches || []).map((match) => ({
        myDeck: match.myDeck || "未設定",
        opponentDeck: match.opponentDeck || "未設定",
        result: match.result || "unknown",
        firstPlayer: match.firstPlayer || "unknown",
        opponentRps: match.opponentRps || "unknown",
        myPassed: match.myPassed || "none",
        opponentPassed: match.opponentPassed || "none",
        environment: sessions.get(match.sessionId)?.environment || "未設定"
      }));
    });
}

function isAiEligible(row) {
  return Boolean(row.accepted_at) && row.ai_training_included !== false;
}

function groupedMatches(matches, nameOf) {
  const rows = new Map();
  matches.forEach((match) => {
    const name = String(nameOf(match) || "未設定").trim() || "未設定";
    const row = rows.get(name) || { name, total: 0, wins: 0 };
    row.total += 1;
    if (match.result === "win") row.wins += 1;
    rows.set(name, row);
  });
  return [...rows.values()]
    .map((row) => ({ ...row, winRate: rate(row.wins, row.total) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ja"));
}

function groupedEnvironments(states) {
  const rows = new Map();
  states.forEach((row) => {
    const matchesBySession = new Map();
    (row.data?.matches || []).forEach((match) => {
      matchesBySession.set(match.sessionId, (matchesBySession.get(match.sessionId) || 0) + 1);
    });
    (row.data?.sessions || []).forEach((session) => {
      const name = session.environment || "未設定";
      const current = rows.get(name) || { name, sessions: 0, matches: 0 };
      current.sessions += 1;
      current.matches += matchesBySession.get(session.id) || 0;
      rows.set(name, current);
    });
  });
  return [...rows.values()].sort((a, b) => b.matches - a.matches || b.sessions - a.sessions);
}

function rate(wins, total) {
  return total ? Math.round((wins / total) * 1000) / 10 : 0;
}
