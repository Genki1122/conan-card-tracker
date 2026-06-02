function rate(wins, total) {
  if (total === 0) return 0;
  return Math.round((wins / total) * 1000) / 10;
}

function tally(matches, predicate = () => true) {
  const filtered = matches.filter(predicate);
  const wins = filtered.filter((match) => match.result === "win").length;
  return {
    total: filtered.length,
    wins,
    winRate: rate(wins, filtered.length)
  };
}

function currentStreak(matches) {
  if (matches.length === 0) {
    return { result: null, count: 0 };
  }

  const sorted = [...matches].sort((a, b) => {
    const dateComparison = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateComparison !== 0) return dateComparison;
    return String(a.id).localeCompare(String(b.id));
  });
  const latestResult = sorted.at(-1).result;
  let count = 0;

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].result !== latestResult) break;
    count += 1;
  }

  return { result: latestResult, count };
}

function groupedBreakdown(matches, key) {
  const groups = new Map();

  matches.forEach((match) => {
    const name = match[key]?.trim() || "未設定";
    const current = groups.get(name) || { name, total: 0, wins: 0, losses: 0, draws: 0 };
    current.total += 1;
    if (match.result === "win") {
      current.wins += 1;
    } else if (match.result === "loss") {
      current.losses += 1;
    } else {
      current.draws += 1;
    }
    groups.set(name, current);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      winRate: rate(group.wins, group.total)
    }))
    .sort((a, b) => b.total - a.total || b.winRate - a.winRate || a.name.localeCompare(b.name, "ja"));
}

const rpsOptions = [
  ["rock", "グー"],
  ["paper", "パー"],
  ["scissors", "チョキ"],
  ["unknown", "未記録"]
];

export function summarizeMatches(matches = []) {
  const total = tally(matches);
  const first = tally(matches, (match) => match.firstPlayer === "first");
  const second = tally(matches, (match) => match.firstPlayer === "second");
  const draws = matches.filter((match) => match.result === "draw").length;

  return {
    total: total.total,
    wins: total.wins,
    losses: total.total - total.wins - draws,
    ...(draws > 0 ? { draws } : {}),
    winRate: total.winRate,
    first,
    second,
    currentStreak: currentStreak(matches)
  };
}

export function getDeckBreakdown(matches = []) {
  return groupedBreakdown(matches, "myDeck");
}

export function getOpponentBreakdown(matches = []) {
  return groupedBreakdown(matches, "opponentDeck");
}

export function getOpponentTurnBreakdown(matches = []) {
  return getOpponentBreakdown(matches).map((row) => {
    const matchupMatches = matches.filter((match) => (match.opponentDeck?.trim() || "未設定") === row.name);
    return {
      ...row,
      first: tally(matchupMatches, (match) => match.firstPlayer === "first"),
      second: tally(matchupMatches, (match) => match.firstPlayer === "second")
    };
  });
}

export function getCrossBreakdown(matches = [], key = "opponentDeck") {
  return groupedBreakdown(matches, key).map((row) => {
    const rowMatches = matches.filter((match) => (match[key]?.trim() || "未設定") === row.name);
    return {
      ...row,
      first: tally(rowMatches, (match) => match.firstPlayer === "first"),
      second: tally(rowMatches, (match) => match.firstPlayer === "second"),
      noPass: tally(rowMatches, (match) => !hasAnyPass(match)),
      anyPass: tally(rowMatches, hasAnyPass)
    };
  });
}

export function summarizeDecks(decks = [], sessions = [], matches = []) {
  return decks.map((deck) => {
    const deckSessions = sessions.filter((session) => session.deckId === deck.id);
    const sessionIds = new Set(deckSessions.map((session) => session.id));
    const deckMatches = matches.filter((match) => sessionIds.has(match.sessionId));
    const summary = summarizeMatches(deckMatches);

    return {
      id: deck.id,
      name: deck.name,
      sessions: deckSessions.length,
      total: summary.total,
      wins: summary.wins,
      losses: summary.losses,
      draws: summary.draws || 0,
      winRate: summary.winRate,
      first: summary.first,
      second: summary.second
    };
  });
}

export function getPlayerBreakdown(matches = []) {
  return groupedBreakdown(matches, "opponentPlayer");
}

export function getPlayerRecord(name, matches = []) {
  const playerMatches = matches.filter((match) => (match.opponentPlayer?.trim() || "未設定") === name);
  const summary = summarizeMatches(playerMatches);

  return {
    name,
    total: summary.total,
    wins: summary.wins,
    losses: summary.losses,
    draws: summary.draws || 0,
    winRate: summary.winRate,
    matches: playerMatches
  };
}

export function getRpsBreakdown(matches = []) {
  const total = matches.length;
  const counts = new Map(rpsOptions.map(([key]) => [key, 0]));

  matches.forEach((match) => {
    const key = counts.has(match.opponentRps) ? match.opponentRps : "unknown";
    counts.set(key, counts.get(key) + 1);
  });

  return rpsOptions.map(([key, label]) => ({
    key,
    label,
    total: counts.get(key),
    percentage: rate(counts.get(key), total)
  }));
}

export function getAnalysisInsights(matches = []) {
  const matchupRows = getOpponentBreakdown(matches);
  const playedRows = matchupRows.filter((row) => row.total > 0);
  const bestMatchup = [...playedRows]
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total || a.name.localeCompare(b.name, "ja"))[0] || null;
  const worstMatchup = [...playedRows]
    .sort((a, b) => a.winRate - b.winRate || b.total - a.total || a.name.localeCompare(b.name, "ja"))[0] || null;
  const summary = summarizeMatches(matches);
  const firstRate = summary.first.winRate;
  const secondRate = summary.second.winRate;
  const gap = Math.abs(firstRate - secondRate);
  const stronger = firstRate >= secondRate ? "first" : "second";
  const weaker = stronger === "first" ? "second" : "first";

  return {
    bestMatchup,
    worstMatchup,
    turnGap: { stronger, weaker, gap },
    passRecord: {
      noPass: tally(matches, (match) => !hasAnyPass(match)),
      anyPass: tally(matches, hasAnyPass)
    }
  };
}

function hasAnyPass(match) {
  return !["none", false, "false", undefined, null, ""].includes(match.myPassed)
    || !["none", false, "false", undefined, null, ""].includes(match.opponentPassed);
}
