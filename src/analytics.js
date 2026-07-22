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
    const name = groupName(match, key);
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

function groupName(match, key) {
  if (key === "month") return String(match.date || "").slice(0, 7) || "未設定";
  return String(match[key] || "").trim() || "未設定";
}

const rpsOptions = [
  ["rock", "グー"],
  ["paper", "パー"],
  ["scissors", "チョキ"],
  ["unknown", "未記録"]
];

export function canWinRandomPrize(placement = "") {
  return placement !== "champion";
}

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
    const rowMatches = matches.filter((match) => groupName(match, key) === row.name);
    return {
      ...row,
      first: tally(rowMatches, (match) => match.firstPlayer === "first"),
      second: tally(rowMatches, (match) => match.firstPlayer === "second"),
      myNoPass: tally(rowMatches, (match) => !isPass(match.myPassed)),
      myAnyPass: tally(rowMatches, (match) => isPass(match.myPassed)),
      opponentNoPass: tally(rowMatches, (match) => !isPass(match.opponentPassed)),
      opponentAnyPass: tally(rowMatches, (match) => isPass(match.opponentPassed))
    };
  });
}

export function filterMatchesByMonth(matches = [], month = "") {
  if (!month) return matches;
  return matches.filter((match) => String(match.date || "").slice(0, 7) === month);
}

export function getStaffRpsBreakdown(sessions = []) {
  const options = rpsOptions.filter(([key]) => key !== "unknown");
  return [0, 1, 2].map((index) => {
    const hands = sessions
      .map((session) => session.staffRpsHands?.[index])
      .filter((hand) => options.some(([key]) => key === hand));
    return {
      position: index + 1,
      total: hands.length,
      rows: options.map(([key, label]) => {
        const total = hands.filter((hand) => hand === key).length;
        return { key, label, total, percentage: rate(total, hands.length) };
      })
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
  return groupedBreakdown(matches.filter((match) => isKnownPlayerName(match.opponentPlayer)), "opponentPlayer");
}

export function getPlayerOverviews(matches = []) {
  return getPlayerBreakdown(matches).map((row) => {
    const playerMatches = matches.filter((match) => String(match.opponentPlayer || "").trim() === row.name);
    const latestMatch = [...playerMatches].sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || ""))
      || String(b.id || "").localeCompare(String(a.id || ""))
    ))[0] || null;
    return {
      ...row,
      latestMatch,
      recordedRps: getRecordedRpsBreakdown(playerMatches)
    };
  });
}

export function sortPlayerOverviews(rows = [], key = "latest", direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return multiplier * a.name.localeCompare(b.name, "ja");
    if (key === "matches") return multiplier * (a.total - b.total) || a.name.localeCompare(b.name, "ja");
    if (key === "winRate") return multiplier * (a.winRate - b.winRate) || multiplier * (a.total - b.total) || a.name.localeCompare(b.name, "ja");
    return multiplier * String(a.latestMatch?.date || "").localeCompare(String(b.latestMatch?.date || "")) || a.name.localeCompare(b.name, "ja");
  });
}

export function playerWinRateTone(winRate = 0) {
  if (winRate > 60) return "positive";
  if (winRate < 40) return "negative";
  return "neutral";
}

export function isKnownPlayerName(name) {
  const normalized = String(name || "").trim();
  return Boolean(normalized) && !["未登録", "不明"].includes(normalized);
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

export function getRecordedRpsBreakdown(matches = []) {
  const options = rpsOptions.filter(([key]) => key !== "unknown");
  const recorded = matches.filter((match) => options.some(([key]) => key === match.opponentRps));
  return {
    total: recorded.length,
    rows: options.map(([key, label]) => {
      const total = recorded.filter((match) => match.opponentRps === key).length;
      return { key, label, total, percentage: rate(total, recorded.length) };
    })
  };
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
      myNoPass: tally(matches, (match) => !isPass(match.myPassed)),
      myAnyPass: tally(matches, (match) => isPass(match.myPassed)),
      opponentNoPass: tally(matches, (match) => !isPass(match.opponentPassed)),
      opponentAnyPass: tally(matches, (match) => isPass(match.opponentPassed))
    }
  };
}

function isPass(value) {
  return !["none", false, "false", undefined, null, ""].includes(value);
}
