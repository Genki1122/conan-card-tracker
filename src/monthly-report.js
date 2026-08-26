import {
  getMyPassUsage,
  summarizeMatches,
  summarizeRounds
} from "./analytics.js";
import { partnerColors } from "./card-catalog.js";
import { sortSessionsNewestFirst } from "./data-operations.js";
import { normalizeRecordType } from "./record-types.js";

const partnerColorIds = new Set(partnerColors.map((color) => color.id));

function reportSummary(matches) {
  const summary = summarizeMatches(matches);
  return {
    total: summary.total,
    wins: summary.wins,
    losses: summary.losses,
    draws: summary.draws || 0,
    winRate: summary.winRate
  };
}

function opponentColorRecords(matches) {
  return partnerColors.map((color) => ({
    ...color,
    ...reportSummary(matches.filter((match) => match.opponentPartnerColor === color.id))
  }));
}

function sessionsForReport(state, month, recordType) {
  return sortSessionsNewestFirst((state.sessions || []).filter((session) => (
    String(session.date || "").slice(0, 7) === month
    && normalizeRecordType(session.recordType) === recordType
  )));
}

export function buildMonthlyReport(state = {}, { month = "", recordType = "challenge" } = {}) {
  const selectedType = normalizeRecordType(recordType);
  const sessions = sessionsForReport(state, month, selectedType);
  const sessionIds = new Set(sessions.map((session) => session.id));
  const matches = (state.matches || []).filter((match) => sessionIds.has(match.sessionId));
  const decksById = new Map((state.decks || []).map((deck) => [deck.id, deck]));

  const deckGroups = new Map();
  sessions.forEach((session) => {
    const group = deckGroups.get(session.deckId) || { sessions: [], matches: [] };
    group.sessions.push(session);
    group.matches.push(...matches.filter((match) => match.sessionId === session.id));
    deckGroups.set(session.deckId, group);
  });

  const summary = reportSummary(matches);
  const decks = [...deckGroups.entries()].map(([deckId, group]) => ({
    id: deckId,
    name: decksById.get(deckId)?.name || "デッキ未設定",
    sessions: group.sessions.length,
    ...reportSummary(group.matches),
    first: reportSummary(group.matches.filter((match) => match.firstPlayer === "first")),
    second: reportSummary(group.matches.filter((match) => match.firstPlayer === "second")),
    opponentColors: opponentColorRecords(group.matches)
  })).sort((left, right) => (
    right.total - left.total
    || right.sessions - left.sessions
    || left.name.localeCompare(right.name, "ja")
  ));

  const events = sessions.map((session) => ({
    id: session.id,
    name: session.name || "大会名未設定",
    date: session.date || "",
    deckName: decksById.get(session.deckId)?.name || "デッキ未設定",
    placement: session.placement || "",
    placementNote: session.placementNote || "",
    randomPrizeWon: Boolean(session.randomPrizeWon),
    record: summarizeRounds(matches.filter((match) => match.sessionId === session.id))
  }));

  return {
    month,
    recordType: selectedType,
    sessionCount: sessions.length,
    summary,
    opponentColorUsage: {
      recorded: reportSummary(matches.filter((match) => partnerColorIds.has(match.opponentPartnerColor))).total,
      total: summary.total
    },
    passUsage: getMyPassUsage(matches),
    awards: {
      champion: sessions.filter((session) => session.placement === "champion").length,
      second: sessions.filter((session) => session.placement === "second").length,
      top4: sessions.filter((session) => session.placement === "top4").length,
      random: sessions.filter((session) => session.randomPrizeWon).length
    },
    decks,
    events
  };
}
