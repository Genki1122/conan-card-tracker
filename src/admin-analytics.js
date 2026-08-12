import { isByeRound, isCompletedMatch, isResolvedRound } from "./analytics.js";
import { qualityRows } from "./data-quality.js";
import { normalizeRecordType } from "./record-types.js";

export function buildAdminOverview(input, now = new Date()) {
  const profiles = input.profiles || [];
  const states = input.states || [];
  const consentedUsers = new Set((input.consents || []).filter(isAiEligible).map((row) => row.user_id));
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const statesByUser = new Map(states.map((row) => [row.user_id, row]));
  const activityCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const allMatches = states.flatMap((row) => row.data?.matches || []).filter(isCompletedMatch);

  const userIds = [...new Set([...profiles.map((profile) => profile.user_id), ...states.map((row) => row.user_id)])];
  const userRows = userIds.map((userId) => {
    const row = statesByUser.get(userId) || { user_id: userId, data: {}, updated_at: "" };
    const profile = profilesByUser.get(userId) || {};
    const matches = (row.data?.matches || []).filter(isCompletedMatch);
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

export function buildAdminDashboard(input, filters = {}, now = new Date()) {
  const requestedFilters = normalizeAdminFilters(filters);
  const profiles = input.profiles || [];
  const states = input.states || [];
  const consents = input.consents || [];
  const recoveries = input.recoveries || [];
  const consentedUsers = new Set(consents.filter(isAiEligible).map((row) => row.user_id));
  const selectedUser = (userId) => !requestedFilters.consentedOnly || consentedUsers.has(userId);
  const selectedStates = states.filter((row) => selectedUser(row.user_id));
  const selectedProfiles = profiles.filter((row) => selectedUser(row.user_id));
  const { records: allRecords, sessions: allSessions } = flattenAdminData(selectedStates);
  const recordTypeSessions = allSessions.filter((session) => (
    requestedFilters.recordType === "all" || session.recordType === requestedFilters.recordType
  ));
  const filterOptions = {
    months: uniqueSorted(recordTypeSessions.map((session) => session.month), true),
    environments: uniqueSorted(recordTypeSessions.map((session) => session.environment))
  };
  const normalizedFilters = {
    ...requestedFilters,
    month: filterOptions.months.includes(requestedFilters.month) ? requestedFilters.month : "",
    environment: filterOptions.environments.includes(requestedFilters.environment) ? requestedFilters.environment : ""
  };
  const contextRecords = allRecords.filter((record) => inAdminContext(record, normalizedFilters));
  const contextSessions = allSessions.filter((session) => inAdminContext(session, normalizedFilters));
  const completedRecords = contextRecords
    .filter(isCompletedMatch)
    .filter((record) => !normalizedFilters.excludePasses || !hasPass(record));
  const qualityRecords = contextRecords
    .filter((record) => !normalizedFilters.excludePasses || !hasPass(record));
  const summary = recordSummary(completedRecords);
  const contextUserIds = new Set([
    ...contextSessions.map((session) => session.userId),
    ...completedRecords.map((record) => record.userId)
  ]);
  const userRows = buildDashboardUserRows({
    profiles: selectedProfiles,
    states: selectedStates,
    records: completedRecords,
    sessions: contextSessions,
    consentedUsers,
    recoveries,
    now
  });

  return {
    filters: normalizedFilters,
    filterOptions,
    summary: {
      users: contextUserIds.size,
      sessions: contextSessions.length,
      matches: summary.total,
      wins: summary.wins,
      losses: summary.losses,
      draws: summary.draws,
      winRate: summary.winRate
    },
    environment: {
      myColors: groupedAdminRecords(completedRecords, (record) => record.myPartnerColor),
      opponentColors: groupedAdminRecords(completedRecords, (record) => record.opponentPartnerColor),
      myCaseCards: groupedAdminRecords(completedRecords, (record) => record.myCaseCardId),
      opponentCaseCards: groupedAdminRecords(completedRecords, (record) => record.opponentCaseCardId),
      myDecks: groupedAdminRecords(completedRecords, (record) => record.myDeck),
      opponentDecks: groupedAdminRecords(completedRecords, (record) => record.opponentDeck),
      placements: groupedAdminSessions(contextSessions, (session) => session.placement),
      randomPrizes: contextSessions.filter((session) => session.randomPrizeWon).length,
      environments: buildEnvironmentRows(contextSessions, completedRecords),
      colorTrends: buildColorTrends(allRecords, allSessions, normalizedFilters)
    },
    matchups: buildColorMatchups(completedRecords),
    usage: buildUsageMetrics({
      profiles: selectedProfiles,
      states: selectedStates,
      records: allRecords,
      contextRecords: completedRecords,
      sessions: contextSessions,
      userRows,
      now
    }),
    quality: buildDataQuality({
      records: qualityRecords,
      profiles: selectedProfiles,
      states: selectedStates,
      consentedUsers,
      now
    }),
    stores: buildStoreRows(contextSessions, completedRecords),
    userRows
  };
}

export function buildAiTrainingDataset(input) {
  const consentedUsers = new Set((input.consents || []).filter(isAiEligible).map((row) => row.user_id));
  return (input.states || [])
    .filter((row) => consentedUsers.has(row.user_id))
    .flatMap((row) => {
      const sessions = new Map((row.data?.sessions || []).map((session) => [session.id, session]));
      return (row.data?.matches || []).filter(isCompletedMatch).map((match) => ({
        myDeck: match.myDeck || "未設定",
        opponentDeck: match.opponentDeck || "未設定",
        result: match.result || "unknown",
        firstPlayer: match.firstPlayer || "unknown",
        opponentRps: match.opponentRps || "unknown",
        myPassed: match.myPassed || "none",
        opponentPassed: match.opponentPassed || "none",
        environment: sessions.get(match.sessionId)?.environment || "未設定",
        recordType: normalizeRecordType(sessions.get(match.sessionId)?.recordType)
      }));
    });
}

export function filterAdminUsers(rows = [], filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("ja");
  const status = filters.status || "all";
  const sort = filters.sort || "attention";
  const direction = filters.direction === "asc" ? 1 : -1;
  const selected = rows.filter((row) => {
    if (query && !String(row.username || "").toLocaleLowerCase("ja").includes(query)) return false;
    if (status === "attention" && !row.needsAttention) return false;
    if (status === "recovery" && !row.recovery?.active) return false;
    if (status === "stale" && !row.stale) return false;
    if (status === "empty" && !row.empty) return false;
    return true;
  });

  return selected.sort((left, right) => {
    const compared = compareAdminUsers(left, right, sort);
    if (compared !== 0) return compared * direction;
    return String(left.username || "").localeCompare(String(right.username || ""), "ja");
  });
}

export function filterAdminMatchups(rows = [], minimumSamples = false) {
  return minimumSamples
    ? rows.filter((row) => Number(row.total || 0) >= 11)
    : rows;
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
    (row.data?.matches || []).filter(isCompletedMatch).forEach((match) => {
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

function normalizeAdminFilters(filters) {
  return {
    month: String(filters.month || "").trim(),
    environment: String(filters.environment || "").trim(),
    recordType: normalizeRecordType(filters.recordType, { allowAll: true }),
    excludePasses: Boolean(filters.excludePasses),
    consentedOnly: Boolean(filters.consentedOnly)
  };
}

function flattenAdminData(states) {
  const records = [];
  const sessions = [];

  states.forEach((stateRow) => {
    const decks = new Map((stateRow.data?.decks || []).map((deck) => [deck.id, deck]));
    const stateSessions = (stateRow.data?.sessions || []).map((session) => {
      const deck = decks.get(session.deckId) || {};
      const date = String(session.date || "");
      const enriched = {
        ...session,
        recordType: normalizeRecordType(session.recordType),
        userId: stateRow.user_id,
        month: date.slice(0, 7),
        environment: String(session.environment || "未設定"),
        myPartnerColor: session.partnerColor || deck.partnerColor || "",
        myCaseCardId: session.caseCardId || deck.caseCardId || ""
      };
      sessions.push(enriched);
      return enriched;
    });
    const sessionsById = new Map(stateSessions.map((session) => [session.id, session]));

    (stateRow.data?.matches || []).forEach((match) => {
      const session = sessionsById.get(match.sessionId) || {};
      records.push({
        ...match,
        userId: stateRow.user_id,
        date: session.date || "",
        month: session.month || "",
        environment: session.environment || "未設定",
        recordType: normalizeRecordType(session.recordType),
        myPartnerColor: session.myPartnerColor || "",
        myCaseCardId: session.myCaseCardId || "",
        opponentPartnerColor: match.opponentPartnerColor || "",
        opponentCaseCardId: match.opponentCaseCardId || ""
      });
    });
  });

  return { records, sessions };
}

function inAdminContext(record, filters) {
  if (filters.recordType !== "all" && record.recordType !== filters.recordType) return false;
  if (filters.month && record.month !== filters.month) return false;
  if (filters.environment && record.environment !== filters.environment) return false;
  return true;
}

function hasPass(match) {
  return passRecorded(match.myPassed) || passRecorded(match.opponentPassed);
}

function passRecorded(value) {
  return !["none", false, "false", undefined, null, ""].includes(value);
}

function recordSummary(records) {
  const wins = records.filter((record) => record.result === "win").length;
  const losses = records.filter((record) => record.result === "loss").length;
  const draws = records.filter((record) => record.result === "draw").length;
  return {
    total: records.length,
    wins,
    losses,
    draws,
    winRate: rate(wins, records.length)
  };
}

function groupedAdminRecords(records, nameOf) {
  const rows = new Map();
  records.forEach((record) => {
    const name = String(nameOf(record) || "unrecorded").trim() || "unrecorded";
    const group = rows.get(name) || [];
    group.push(record);
    rows.set(name, group);
  });
  return [...rows.entries()]
    .map(([name, group]) => ({
      name,
      ...recordSummary(group),
      percentage: rate(group.length, records.length)
    }))
    .sort((a, b) => b.total - a.total || b.winRate - a.winRate || a.name.localeCompare(b.name, "ja"));
}

function groupedAdminSessions(sessions, nameOf) {
  const rows = new Map();
  sessions.forEach((session) => {
    const name = String(nameOf(session) || "unrecorded").trim() || "unrecorded";
    rows.set(name, (rows.get(name) || 0) + 1);
  });
  return [...rows.entries()]
    .map(([name, total]) => ({ name, total, percentage: rate(total, sessions.length) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ja"));
}

function buildColorMatchups(records) {
  const colorOrder = ["blue", "green", "white", "red", "yellow", "black"];
  const colorSet = new Set(colorOrder);
  const groups = new Map();

  records
    .filter((record) => colorSet.has(record.myPartnerColor) && colorSet.has(record.opponentPartnerColor))
    .forEach((record) => {
      const key = `${record.myPartnerColor}:${record.opponentPartnerColor}`;
      const group = groups.get(key) || [];
      group.push(record);
      groups.set(key, group);
    });

  return [...groups.entries()]
    .map(([key, group]) => {
      const [myColor, opponentColor] = key.split(":");
      return {
        myColor,
        opponentColor,
        ...recordSummary(group),
        first: recordSummary(group.filter((record) => record.firstPlayer === "first")),
        second: recordSummary(group.filter((record) => record.firstPlayer === "second")),
        unrecordedTurn: recordSummary(group.filter((record) => !["first", "second"].includes(record.firstPlayer))),
        opponentCaseCards: groupedAdminRecords(group, (record) => record.opponentCaseCardId).map((item) => {
          const caseCardRecords = group.filter((record) => (
            String(record.opponentCaseCardId || "unrecorded").trim() === item.name
          ));
          return {
            ...item,
            first: recordSummary(caseCardRecords.filter((record) => record.firstPlayer === "first")),
            second: recordSummary(caseCardRecords.filter((record) => record.firstPlayer === "second")),
            unrecordedTurn: recordSummary(caseCardRecords.filter((record) => !["first", "second"].includes(record.firstPlayer)))
          };
        })
      };
    })
    .sort((a, b) => (
      colorOrder.indexOf(a.myColor) - colorOrder.indexOf(b.myColor)
      || colorOrder.indexOf(a.opponentColor) - colorOrder.indexOf(b.opponentColor)
    ));
}

function buildEnvironmentRows(sessions, records) {
  const rows = new Map();
  sessions.forEach((session) => {
    const name = session.environment || "未設定";
    const row = rows.get(name) || { name, sessions: 0, matches: 0, users: new Set() };
    row.sessions += 1;
    row.users.add(session.userId);
    rows.set(name, row);
  });
  records.forEach((record) => {
    const name = record.environment || "未設定";
    const row = rows.get(name) || { name, sessions: 0, matches: 0, users: new Set() };
    row.matches += 1;
    row.users.add(record.userId);
    rows.set(name, row);
  });
  return [...rows.values()]
    .map((row) => ({ name: row.name, sessions: row.sessions, matches: row.matches, users: row.users.size }))
    .sort((a, b) => b.matches - a.matches || b.sessions - a.sessions || a.name.localeCompare(b.name, "ja"));
}

function buildColorTrends(records, sessions, filters) {
  const months = uniqueSorted(sessions.map((session) => session.month), true);
  const currentMonth = filters.month || months[0] || "";
  if (!currentMonth) return { currentMonth: "", previousMonth: "", rows: [] };
  const previousMonth = shiftMonth(currentMonth, -1);
  const scoped = records
    .filter(isCompletedMatch)
    .filter((record) => !filters.environment || record.environment === filters.environment)
    .filter((record) => !filters.excludePasses || !hasPass(record));
  const current = groupedAdminRecords(scoped.filter((record) => record.month === currentMonth), (record) => record.myPartnerColor);
  const previous = groupedAdminRecords(scoped.filter((record) => record.month === previousMonth), (record) => record.myPartnerColor);
  const currentByName = new Map(current.map((row) => [row.name, row]));
  const previousByName = new Map(previous.map((row) => [row.name, row]));
  const names = [...new Set([...currentByName.keys(), ...previousByName.keys()])];
  return {
    currentMonth,
    previousMonth,
    rows: names.map((name) => ({
      name,
      current: currentByName.get(name)?.total || 0,
      previous: previousByName.get(name)?.total || 0,
      delta: (currentByName.get(name)?.total || 0) - (previousByName.get(name)?.total || 0)
    })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current)
  };
}

function buildDashboardUserRows({ profiles, states, records, sessions, consentedUsers, recoveries, now }) {
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const statesByUser = new Map(states.map((row) => [row.user_id, row]));
  const recoveryByUser = new Map(recoveries.map((row) => [row.user_id, row]));
  const staleCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const userIds = [...new Set([...profiles.map((row) => row.user_id), ...states.map((row) => row.user_id)])];
  return userIds.map((userId) => {
    const userRecords = records.filter((record) => record.userId === userId);
    const userSessions = sessions.filter((session) => session.userId === userId);
    const summary = recordSummary(userRecords);
    const stateRow = statesByUser.get(userId);
    const recoveryRow = recoveryByUser.get(userId) || {};
    const recoveryActive = ["detected", "reviewing", "saving", "failed"].includes(recoveryRow.status);
    const empty = summary.total === 0 && userSessions.length === 0;
    const stale = !stateRow?.updated_at || new Date(stateRow.updated_at).getTime() < staleCutoff;
    return {
      userId,
      username: profilesByUser.get(userId)?.username || "未設定",
      decks: stateRow?.data?.decks?.length || 0,
      sessions: userSessions.length,
      matches: summary.total,
      wins: summary.wins,
      losses: summary.losses,
      draws: summary.draws,
      winRate: summary.winRate,
      lastUpdated: stateRow?.updated_at || "",
      consented: consentedUsers.has(userId),
      empty,
      stale,
      needsAttention: recoveryActive || stale || empty,
      recovery: {
        active: recoveryActive,
        status: recoveryRow.status || "",
        decks: recoveryRow.anonymous_decks || 0,
        sessions: recoveryRow.anonymous_sessions || 0,
        matches: recoveryRow.anonymous_matches || 0,
        ambiguous: recoveryRow.ambiguous_count || 0,
        errorCode: recoveryRow.error_code || "",
        updatedAt: recoveryRow.updated_at || ""
      }
    };
  }).sort((a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated)));
}

function compareAdminUsers(left, right, sort) {
  if (sort === "attention") return attentionScore(left) - attentionScore(right);
  if (sort === "latest") return String(left.lastUpdated || "").localeCompare(String(right.lastUpdated || ""));
  if (["matches", "sessions", "winRate"].includes(sort)) return Number(left[sort] || 0) - Number(right[sort] || 0);
  return 0;
}

function attentionScore(row) {
  if (row.recovery?.status === "failed") return 5;
  if (row.recovery?.active) return 4;
  if (row.stale) return 3;
  if (row.empty) return 2;
  return row.needsAttention ? 1 : 0;
}

function buildUsageMetrics({ profiles, states, records, contextRecords, sessions, userRows, now }) {
  const nowTime = now.getTime();
  const active7d = nowTime - 7 * 24 * 60 * 60 * 1000;
  const active30d = nowTime - 30 * 24 * 60 * 60 * 1000;
  const userIds = new Set([...profiles.map((row) => row.user_id), ...states.map((row) => row.user_id)]);
  const activeUsers7d = new Set(states
    .filter((row) => new Date(row.updated_at).getTime() >= active7d)
    .map((row) => row.user_id));
  const activeUsers30d = new Set(states
    .filter((row) => new Date(row.updated_at).getTime() >= active30d)
    .map((row) => row.user_id));
  const activatedUsers = new Set(records.map((record) => record.userId));
  const completedUsers = new Set(records.filter(isCompletedMatch).map((record) => record.userId));
  const activityRows = new Map();
  sessions.forEach((session) => {
    const row = activityRows.get(session.month) || { month: session.month, sessions: 0, matches: 0, users: new Set() };
    row.sessions += 1;
    row.users.add(session.userId);
    activityRows.set(session.month, row);
  });
  contextRecords.forEach((record) => {
    const row = activityRows.get(record.month) || { month: record.month, sessions: 0, matches: 0, users: new Set() };
    row.matches += 1;
    row.users.add(record.userId);
    activityRows.set(record.month, row);
  });

  return {
    registeredUsers: userIds.size,
    activatedUsers: activatedUsers.size,
    completedUsers: completedUsers.size,
    activeUsers7d: activeUsers7d.size,
    activeUsers30d: activeUsers30d.size,
    inactiveUsers30d: Math.max(0, userIds.size - activeUsers30d.size),
    averageMatchesPerUser: userIds.size ? Math.round((contextRecords.length / userIds.size) * 10) / 10 : 0,
    activityByMonth: [...activityRows.values()]
      .filter((row) => row.month)
      .map((row) => ({ month: row.month, sessions: row.sessions, matches: row.matches, users: row.users.size }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    userRows
  };
}

function buildDataQuality({ records, profiles, states, consentedUsers, now }) {
  const staleCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const userIds = new Set([...profiles.map((row) => row.user_id), ...states.map((row) => row.user_id)]);
  const freshUserIds = new Set(states
    .filter((row) => new Date(row.updated_at).getTime() >= staleCutoff)
    .map((row) => row.user_id));
  const gameplayRecords = records.filter((record) => !isByeRound(record));
  const total = gameplayRecords.length;
  const fields = qualityRows(gameplayRecords);
  return {
    totalRecords: total,
    completedMatches: gameplayRecords.filter(isCompletedMatch).length,
    pendingMatches: gameplayRecords.filter((record) => !isResolvedRound(record)).length,
    byeRounds: records.filter(isByeRound).length,
    staleUsers30d: Math.max(0, userIds.size - freshUserIds.size),
    aiEligibleUsers: consentedUsers.size,
    aiEligibleMatches: gameplayRecords.filter((record) => consentedUsers.has(record.userId) && isCompletedMatch(record)).length,
    fields
  };
}

function buildStoreRows(sessions, records) {
  const recordsBySession = new Map();
  records.forEach((record) => {
    const key = `${record.userId}:${record.sessionId}`;
    recordsBySession.set(key, (recordsBySession.get(key) || 0) + 1);
  });
  const rows = new Map();
  sessions.forEach((session) => {
    const name = String(session.name || "未設定").trim() || "未設定";
    const row = rows.get(name) || {
      name,
      sessions: 0,
      matches: 0,
      users: new Set(),
      latestDate: "",
      randomPrizeMethods: new Map()
    };
    row.sessions += 1;
    row.matches += recordsBySession.get(`${session.userId}:${session.id}`) || 0;
    row.users.add(session.userId);
    row.latestDate = String(session.date || "") > row.latestDate ? session.date : row.latestDate;
    const method = session.randomPrizeMethod || "unrecorded";
    row.randomPrizeMethods.set(method, (row.randomPrizeMethods.get(method) || 0) + 1);
    rows.set(name, row);
  });
  return [...rows.values()]
    .map((row) => ({
      name: row.name,
      sessions: row.sessions,
      matches: row.matches,
      users: row.users.size,
      latestDate: row.latestDate,
      randomPrizeMethods: [...row.randomPrizeMethods.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
    }))
    .sort((a, b) => b.sessions - a.sessions || b.latestDate.localeCompare(a.latestDate));
}

function uniqueSorted(values, descending = false) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => (
    descending ? b.localeCompare(a, "ja") : a.localeCompare(b, "ja")
  ));
}

function shiftMonth(month, offset) {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return "";
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rate(wins, total) {
  return total ? Math.round((wins / total) * 1000) / 10 : 0;
}
