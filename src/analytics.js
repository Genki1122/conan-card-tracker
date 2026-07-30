function rate(wins, total) {
  if (total === 0) return 0;
  return Math.round((wins / total) * 1000) / 10;
}

const completedResults = new Set(["win", "loss", "draw"]);

export function isCompletedMatch(match) {
  return completedResults.has(match?.result);
}

function completedMatches(matches = []) {
  return matches.filter(isCompletedMatch);
}

function tally(matches, predicate = () => true) {
  const filtered = completedMatches(matches).filter(predicate);
  const wins = filtered.filter((match) => match.result === "win").length;
  return {
    total: filtered.length,
    wins,
    winRate: rate(wins, filtered.length)
  };
}

function currentStreak(matches) {
  const completed = completedMatches(matches);
  if (completed.length === 0) {
    return { result: null, count: 0 };
  }

  const sorted = [...completed].sort((a, b) => {
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

  completedMatches(matches).forEach((match) => {
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

export function isPassRecorded(value) {
  return !["none", false, "false", undefined, null, ""].includes(value);
}

export function filterMatchesWithoutPasses(matches = []) {
  return matches.filter((match) => !isPassRecorded(match.myPassed) && !isPassRecorded(match.opponentPassed));
}

export function formatPercentage(value) {
  const numeric = Number(value);
  return `${(Number.isFinite(numeric) ? numeric : 0).toFixed(1)}%`;
}

export function formatRecordSummary(record = {}) {
  const total = Number(record.total) || 0;
  const wins = Number(record.wins) || 0;
  const draws = Number(record.draws) || 0;
  const losses = Number.isFinite(Number(record.losses))
    ? Number(record.losses)
    : Math.max(0, total - wins - draws);
  return `${wins}-${losses}-${draws} / ${total}戦`;
}

export function formatRecordSummaryWithRate(record = {}) {
  return `${formatRecordSummary(record)} ${formatPercentage(record.winRate)}`;
}

export function isSmallSample(total, minimumTotal = 11) {
  return (Number(total) || 0) < Math.max(1, Number(minimumTotal) || 11);
}

export function summarizeMatches(matches = []) {
  const total = tally(matches);
  const first = fullRecord(matches.filter((match) => match.firstPlayer === "first"));
  const second = fullRecord(matches.filter((match) => match.firstPlayer === "second"));
  const draws = completedMatches(matches).filter((match) => match.result === "draw").length;

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

export function getColorMatchups(matches = [], minimumTotal = 1) {
  const colorOrder = ["blue", "green", "white", "red", "yellow", "black"];
  const knownColors = new Set(colorOrder);
  const groups = new Map();

  completedMatches(matches)
    .filter((match) => knownColors.has(match.myPartnerColor) && knownColors.has(match.opponentPartnerColor))
    .forEach((match) => {
      const key = `${match.myPartnerColor}:${match.opponentPartnerColor}`;
      const group = groups.get(key) || [];
      group.push(match);
      groups.set(key, group);
    });

  return [...groups.entries()]
    .map(([key, group]) => {
      const [myColor, opponentColor] = key.split(":");
      return {
        myColor,
        opponentColor,
        ...fullRecordWithTurns(group),
        opponentCaseCards: groupedBreakdown(group, "opponentCaseCard").map((row) => ({
          ...row,
          ...turnRecords(group.filter((match) => groupName(match, "opponentCaseCard") === row.name))
        }))
      };
    })
    .filter((row) => row.total >= Math.max(1, Number(minimumTotal) || 1))
    .sort((a, b) => (
      colorOrder.indexOf(a.myColor) - colorOrder.indexOf(b.myColor)
      || colorOrder.indexOf(a.opponentColor) - colorOrder.indexOf(b.opponentColor)
    ));
}

function fullRecord(matches = []) {
  const completed = completedMatches(matches);
  const wins = completed.filter((match) => match.result === "win").length;
  const losses = completed.filter((match) => match.result === "loss").length;
  const draws = completed.filter((match) => match.result === "draw").length;
  return {
    total: completed.length,
    wins,
    losses,
    draws,
    winRate: rate(wins, completed.length)
  };
}

function fullRecordWithTurns(matches = []) {
  return {
    ...fullRecord(matches),
    ...turnRecords(matches)
  };
}

function turnRecords(matches = []) {
  return {
    first: fullRecord(matches.filter((match) => match.firstPlayer === "first")),
    second: fullRecord(matches.filter((match) => match.firstPlayer === "second")),
    unrecordedTurn: fullRecord(matches.filter((match) => !["first", "second"].includes(match.firstPlayer)))
  };
}

export function filterMatchesByMonth(matches = [], month = "") {
  if (!month) return matches;
  return matches.filter((match) => String(match.date || "").slice(0, 7) === month);
}

export function filterMatchesByEnvironment(matches = [], environment = "") {
  if (!environment) return matches;
  return matches.filter((match) => String(match.environment || "未設定") === environment);
}

export function filterDecksByArchived(decks = [], archived = false) {
  return decks.filter((deck) => Boolean(deck.archived) === archived);
}

export function formatRecordDate(value, referenceYear = new Date().getFullYear()) {
  const dateValue = String(value || "").slice(0, 10);
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "日付未設定";
  const [, year, month, day] = match;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${dateValue}T00:00:00`).getDay()];
  const prefix = Number(year) === Number(referenceYear) ? "" : `${Number(year)}/`;
  return `${prefix}${Number(month)}/${Number(day)}(${weekday})`;
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
  const names = [...new Set(matches
    .map((match) => String(match.opponentPlayer || "").trim())
    .filter(isKnownPlayerName))];
  return names.map((name) => {
    const playerMatches = matches.filter((match) => String(match.opponentPlayer || "").trim() === name);
    const summary = summarizeMatches(playerMatches);
    const latestMatch = [...playerMatches].sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || ""))
      || String(b.id || "").localeCompare(String(a.id || ""))
    ))[0] || null;
    return {
      name,
      total: summary.total,
      wins: summary.wins,
      losses: summary.losses,
      draws: summary.draws,
      winRate: summary.winRate,
      latestMatch,
      recordedRps: getRecordedRpsBreakdown(playerMatches)
    };
  });
}

export function getPlayerDeckOverviews(matches = []) {
  const names = [...new Set(matches.map((match) => groupName(match, "opponentDeck")))];
  return names
    .map((name) => {
      const deckMatches = matches.filter((match) => groupName(match, "opponentDeck") === name);
      const summary = summarizeMatches(deckMatches);
      const latestMatch = [...deckMatches].sort((a, b) => (
        String(b.date || "").localeCompare(String(a.date || ""))
        || String(b.id || "").localeCompare(String(a.id || ""))
      ))[0] || null;
      return {
        name,
        total: summary.total,
        wins: summary.wins,
        losses: summary.losses,
        draws: summary.draws,
        winRate: summary.winRate,
        latestMatch
      };
    })
    .sort((a, b) => (
      String(b.latestMatch?.date || "").localeCompare(String(a.latestMatch?.date || ""))
      || String(b.latestMatch?.id || "").localeCompare(String(a.latestMatch?.id || ""))
      || a.name.localeCompare(b.name, "ja")
    ));
}

export function getPlayerOverviewsByMonth(matches = [], month = "") {
  return getPlayerOverviews(filterMatchesByMonth(matches, month));
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
