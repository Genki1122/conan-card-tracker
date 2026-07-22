import {
  canWinRandomPrize,
  filterDecksByArchived,
  filterMatchesByEnvironment,
  filterMatchesByMonth,
  formatRecordDate,
  getCrossBreakdown,
  getPlayerOverviews,
  getPlayerRecord,
  getRecordedRpsBreakdown,
  getStaffRpsBreakdown,
  isKnownPlayerName,
  playerWinRateTone,
  sortPlayerOverviews,
  summarizeDecks,
  summarizeMatches
} from "./analytics.js";
import { stateSummary, statesEqual } from "./sync-state.js";
import {
  cloudSnapshot,
  getCloudConfig,
  initializeCloud,
  isCloudConfigured,
  loadCloudState,
  saveCloudConfig,
  saveCloudState,
  signInWithEmail,
  signOutCloud
} from "./cloud.js";

const storageKey = "conan-card-tracker-v2";
const legacyStorageKey = "conan-card-match-casebook";
const syncMetaStorageKey = "conan-card-tracker-sync-meta-v1";

const view = document.querySelector("#appView");
const phoneShell = document.querySelector(".phone-shell");
const title = document.querySelector("#screenTitle");
const topBar = document.querySelector(".top-bar");
const syncStatusLabel = document.querySelector("#syncStatus");
const backButton = document.querySelector("#backButton");
const fabButton = document.querySelector("#fabButton");
const updateBanner = document.querySelector("#updateBanner");
const applyUpdateButton = document.querySelector("#applyUpdateButton");
const dialog = document.querySelector("#entryDialog");
const entryForm = document.querySelector("#entryForm");
const dialogKicker = document.querySelector("#dialogKicker");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const dialogSubmit = document.querySelector("#dialogSubmit");
const navButtons = [...document.querySelectorAll(".nav-button")];
const suggestionLists = {
  opponentDecks: document.querySelector("#opponentDeckSuggestions"),
  players: document.querySelector("#playerSuggestions"),
  sessionNames: document.querySelector("#sessionNameSuggestions"),
  environments: document.querySelector("#environmentSuggestions")
};

let state = loadState();
let syncMeta = loadSyncMeta();
let route = { name: "decks" };
let dialogMode = null;
let editingMatchId = null;
let editingSessionId = null;
let cloudStatus = cloudSnapshot("local");
let cloudMessage = "";
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSavePending = false;
let cloudUpdatedAt = syncMeta.updatedAt || null;
let localDirty = Boolean(syncMeta.dirty);
let cloudConflict = false;
let pendingRemoteState = null;

const rpsLabels = { rock: "グー", scissors: "チョキ", paper: "パー", unknown: "未記録" };
const resultLabels = { win: "Win", loss: "Lose", draw: "Draw" };
const firstLabels = { first: "先攻", second: "後攻" };
const passLabels = {
  none: "無し",
  pass1: "1パス",
  pass2: "2パス",
  pass3: "3パス",
  pass12: "1&2パス",
  false: "無し",
  true: "有"
};
const placementLabels = { champion: "優勝", second: "2位", top4: "ベスト4", other: "その他" };
const prizeMethodLabels = { rps: "じゃんけん", roulette: "ルーレット", other: "その他", unrecorded: "未記録" };

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) return normalizeState(saved);
  } catch {
    // Ignore malformed local data and fall back to a clean state.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey)) || [];
    if (legacy.length > 0) return migrateLegacyMatches(legacy);
  } catch {
    // Ignore old data that cannot be migrated.
  }

  return normalizeState({
    decks: [
      { id: "deck-takagi", name: "高木婚活", version: "v1", color: "purple" },
      { id: "deck-conan", name: "赤青コナン", version: "v1", color: "blue" }
    ],
    sessions: [
      { id: "session-1", deckId: "deck-takagi", deckVersion: "v1", name: "秋葉原チェルモ", date: "2026-05-30", format: "BO1", environment: "未設定" },
      { id: "session-2", deckId: "deck-takagi", deckVersion: "v1", name: "カードマウンテン", date: "2026-05-29", format: "BO1", environment: "未設定" }
    ],
    environments: ["未設定"],
    matches: [
      makeMatch("session-1", "高木婚活", "婚活警視庁", "佐藤さん", "win", "first", "rock", "none", "none"),
      makeMatch("session-1", "高木婚活", "婚活長野", "伊達さん", "win", "first", "scissors", "none", "none"),
      makeMatch("session-1", "高木婚活", "白黄王冠", "田中さん", "win", "second", "paper", "none", "pass1"),
      makeMatch("session-1", "高木婚活", "白黄王冠", "田中さん", "win", "first", "rock", "none", "none"),
      makeMatch("session-1", "高木婚活", "疾風警視庁", "鈴木さん", "loss", "first", "scissors", "pass1", "none"),
      makeMatch("session-2", "高木婚活", "緑服部", "佐藤さん", "win", "second", "rock", "none", "none"),
      makeMatch("session-2", "高木婚活", "青蘭", "山本さん", "win", "second", "paper", "none", "none")
    ]
  });
}

function loadSyncMeta() {
  try {
    return JSON.parse(localStorage.getItem(syncMetaStorageKey)) || {};
  } catch {
    return {};
  }
}

function saveSyncMeta() {
  syncMeta = {
    dirty: localDirty,
    updatedAt: cloudUpdatedAt || null
  };
  localStorage.setItem(syncMetaStorageKey, JSON.stringify(syncMeta));
}

function markLocalDirty() {
  localDirty = true;
  saveSyncMeta();
}

function markCloudSynced(updatedAt) {
  cloudUpdatedAt = updatedAt || cloudUpdatedAt;
  localDirty = false;
  saveSyncMeta();
}

function normalizeState(rawState) {
  const rawSessions = rawState.sessions || [];
  const datesByDeck = new Map();
  rawSessions.forEach((session) => {
    const dates = datesByDeck.get(session.deckId) || [];
    if (session.date) dates.push(session.date);
    datesByDeck.set(session.deckId, dates);
  });
  const decks = (rawState.decks || []).map((deck) => {
    const dates = datesByDeck.get(deck.id) || [];
    return {
      ...deck,
      version: deck.version || "v1",
      archived: Boolean(deck.archived),
      createdAt: deck.createdAt || dates.sort()[0] || "1970-01-01",
      lastUsedAt: deck.lastUsedAt || dates.sort().at(-1) || ""
    };
  });
  const deckVersions = new Map(decks.map((deck) => [deck.id, deck.version]));
  const sessionEnvironments = (rawState.sessions || []).map((session) => normalizeEnvironmentName(session.environment));
  return {
    decks,
    sessions: rawSessions.map((session) => ({
      ...session,
      environment: normalizeEnvironmentName(session.environment),
      deckVersion: session.deckVersion || deckVersions.get(session.deckId) || "v1",
      placement: session.placement || "",
      placementNote: session.placementNote || "",
      randomPrizeWon: canWinRandomPrize(session.placement) ? Boolean(session.randomPrizeWon) : false,
      randomPrizeMethod: session.randomPrizeMethod || "",
      randomPrizeMethodNote: session.randomPrizeMethodNote || "",
      staffRpsHands: [0, 1, 2].map((index) => session.staffRpsHands?.[index] || "")
    })),
    environments: uniqueValues([...(rawState.environments || []).map(normalizeEnvironmentName), ...sessionEnvironments]),
    matches: (rawState.matches || []).map((match) => ({
      ...match,
      opponentPlayer: normalizePlayerName(match.opponentPlayer)
    }))
  };
}

function normalizeEnvironmentName(environment) {
  const name = String(environment || "").trim();
  return !name || name === "現環境" ? "未設定" : name;
}

function migrateLegacyMatches(matches) {
  const decks = [...new Set(matches.map((match) => match.myDeck || "未設定"))].map((name) => ({
    id: crypto.randomUUID(),
    name,
    version: "v1",
    color: "purple",
    archived: false,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString()
  }));
  const sessions = decks.map((deck) => ({
    id: crypto.randomUUID(),
    deckId: deck.id,
    deckVersion: deck.version,
    name: "移行データ",
    date: new Date().toISOString().slice(0, 10),
    format: "BO1",
    environment: "未設定",
    placement: "",
    placementNote: "",
    randomPrizeWon: false,
    randomPrizeMethod: "",
    randomPrizeMethodNote: "",
    staffRpsHands: ["", "", ""]
  }));
  const deckByName = new Map(decks.map((deck) => [deck.name, deck]));
  const sessionByDeck = new Map(sessions.map((session) => [session.deckId, session]));

  return {
    decks,
    sessions,
    environments: ["未設定"],
    matches: matches.map((match) => {
      const deck = deckByName.get(match.myDeck || "未設定");
      return {
        ...match,
        id: crypto.randomUUID(),
        sessionId: sessionByDeck.get(deck.id).id,
        opponentPlayer: "不明",
        opponentRps: "unknown",
        myPassed: "none",
        opponentPassed: "none"
      };
    })
  };
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePlayerName(value) {
  const name = String(value || "").trim();
  return !name || name === "未登録" ? "不明" : name;
}

function makeMatch(sessionId, myDeck, opponentDeck, opponentPlayer, result, firstPlayer, opponentRps, myPassed, opponentPassed) {
  return {
    id: crypto.randomUUID(),
    sessionId,
    myDeck,
    opponentDeck,
    opponentPlayer,
    result,
    firstPlayer,
    opponentRps,
    myPassed,
    opponentPassed,
    memo: ""
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  markLocalDirty();
  scheduleCloudSave();
}

function scheduleCloudSave() {
  if (!cloudStatus.signedIn || cloudConflict) return;
  window.clearTimeout(cloudSaveTimer);
  if (!navigator.onLine) {
    cloudMessage = "オフライン・未同期";
    renderSyncStatus();
    return;
  }
  cloudMessage = "クラウド保存待ち";
  renderSyncStatus();
  cloudSaveTimer = window.setTimeout(flushCloudSave, 500);
}

async function flushCloudSave() {
  if (!cloudStatus.signedIn || cloudConflict) return;
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return;
  }

  cloudSaveInFlight = true;
  cloudSavePending = false;
  const snapshot = JSON.parse(JSON.stringify(state));
  renderSyncStatus();
  try {
    const updatedAt = await saveCloudState(snapshot, { expectedUpdatedAt: cloudUpdatedAt });
    cloudUpdatedAt = updatedAt;
    if (statesEqual(snapshot, state)) {
      markCloudSynced(updatedAt);
    } else {
      localDirty = true;
      cloudSavePending = true;
      saveSyncMeta();
    }
    cloudConflict = false;
    pendingRemoteState = null;
    cloudMessage = localDirty ? "続きの変更をクラウド保存待ち" : "クラウド保存済み";
    rerenderOpenMenu();
  } catch (error) {
    cloudConflict = error.code === "CLOUD_CONFLICT";
    cloudMessage = `クラウド保存失敗: ${error.message}`;
    rerenderOpenMenu();
  } finally {
    cloudSaveInFlight = false;
    renderSyncStatus();
    if (cloudSavePending) scheduleCloudSave();
  }
}

function rerenderOpenMenu() {
  renderSyncStatus();
  if (dialog.open && ["menu", "cloudSettings"].includes(dialogMode)) openDialog(dialogMode);
}

function renderSyncStatus() {
  if (!syncStatusLabel) return;
  let text = "端末保存";
  let tone = "local";
  if (!navigator.onLine) {
    text = localDirty ? "未同期" : "オフライン";
    tone = "warning";
  } else if (cloudConflict || cloudMessage.startsWith("クラウド保存失敗") || cloudMessage.startsWith("クラウド接続失敗")) {
    text = "同期要確認";
    tone = "error";
  } else if (cloudStatus.configured && !cloudStatus.signedIn) {
    text = "未ログイン";
    tone = "warning";
  } else if (cloudStatus.signedIn && (localDirty || cloudSaveInFlight || cloudMessage.includes("保存待ち") || cloudMessage.includes("保存中"))) {
    text = "保存中";
    tone = "pending";
  } else if (cloudStatus.signedIn) {
    text = "同期済み";
    tone = "synced";
  }
  syncStatusLabel.textContent = text;
  syncStatusLabel.dataset.tone = tone;
}

function updateSuggestions() {
  suggestionLists.opponentDecks.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentDeck)));
  suggestionLists.players.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentPlayer).filter(isKnownPlayerName)));
  suggestionLists.sessionNames.innerHTML = optionList(uniqueValues(state.sessions.map((session) => session.name)));
  suggestionLists.environments.innerHTML = optionList(uniqueValues([...(state.environments || []), ...state.sessions.map((session) => session.environment)]));
}

function optionList(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function setRoute(nextRoute) {
  route = nextRoute;
  render();
}

function getDeck(id) {
  return state.decks.find((deck) => deck.id === id);
}

function getSession(id) {
  return state.sessions.find((session) => session.id === id);
}

function matchesForSession(sessionId) {
  return state.matches.filter((match) => match.sessionId === sessionId);
}

function sessionsForDeck(deckId) {
  return state.sessions.filter((session) => session.deckId === deckId);
}

function matchesForDeck(deckId) {
  const ids = new Set(sessionsForDeck(deckId).map((session) => session.id));
  return state.matches.filter((match) => ids.has(match.sessionId));
}

function enrichMatches(matches) {
  return matches.map((match, index) => {
    const session = getSession(match.sessionId);
    return {
      ...match,
      environment: session?.environment || "未設定",
      deckVersion: session?.deckVersion || "v1",
      store: session?.name || "未設定",
      date: session?.date || "",
      order: index
    };
  });
}

function analysisMatchesForDeck(deckId, environment = "", store = "", deckVersion = "") {
  const sessions = state.sessions.filter((session) => (
    (!deckId || session.deckId === deckId)
    &&
    (!environment || session.environment === environment)
    && (!store || session.name === store)
    && (!deckVersion || session.deckVersion === deckVersion)
  ));
  const ids = new Set(sessions.map((session) => session.id));
  return enrichMatches(state.matches.filter((match) => ids.has(match.sessionId)));
}

function storesForDeck(deckId, environment = "", deckVersion = "") {
  return uniqueValues(
    state.sessions
      .filter((session) => !deckId || session.deckId === deckId)
      .filter((session) => !environment || session.environment === environment)
      .filter((session) => !deckVersion || session.deckVersion === deckVersion)
      .map((session) => session.name)
  );
}

function versionsForDeck(deckId) {
  if (!deckId) return [];
  return uniqueValues(sessionsForDeck(deckId).map((session) => session.deckVersion || "v1"));
}

function analysisMonths() {
  const current = relativeMonth(0);
  const previous = relativeMonth(-1);
  return uniqueValues([current, previous, ...state.sessions.map((session) => String(session.date || "").slice(0, 7))]).sort().reverse();
}

function relativeMonth(offset) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function splitPassRecord(matches) {
  return {
    myNoPass: summarizeMatches(matches.filter((match) => !isPassValue(match.myPassed))),
    myAnyPass: summarizeMatches(matches.filter((match) => isPassValue(match.myPassed))),
    opponentNoPass: summarizeMatches(matches.filter((match) => !isPassValue(match.opponentPassed))),
    opponentAnyPass: summarizeMatches(matches.filter((match) => isPassValue(match.opponentPassed)))
  };
}

function isPassValue(value) {
  return !["none", false, "false", undefined, null, ""].includes(value);
}

function sortCrossRows(rows, sortKey) {
  return [...rows].sort((a, b) => {
    if (sortKey === "low") return a.winRate - b.winRate || b.total - a.total || a.name.localeCompare(b.name, "ja");
    if (sortKey === "high") return b.winRate - a.winRate || b.total - a.total || a.name.localeCompare(b.name, "ja");
    return b.total - a.total || b.winRate - a.winRate || a.name.localeCompare(b.name, "ja");
  });
}

function deleteDeck(deckId) {
  const sessionIds = new Set(sessionsForDeck(deckId).map((session) => session.id));
  state.decks = state.decks.filter((deck) => deck.id !== deckId);
  state.sessions = state.sessions.filter((session) => session.deckId !== deckId);
  state.matches = state.matches.filter((match) => !sessionIds.has(match.sessionId));
}

function deleteSession(sessionId) {
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  state.matches = state.matches.filter((match) => match.sessionId !== sessionId);
}

function matchesForDeckInEnvironment(deckId, environment) {
  const sessions = sessionsForDeck(deckId).filter((session) => !environment || session.environment === environment);
  const ids = new Set(sessions.map((session) => session.id));
  return state.matches.filter((match) => ids.has(match.sessionId));
}

function environmentsForDeck(deckId, deckVersion = "") {
  return uniqueValues(
    state.sessions
      .filter((session) => !deckId || session.deckId === deckId)
      .filter((session) => !deckVersion || session.deckVersion === deckVersion)
      .map((session) => session.environment || "未設定")
  );
}

function deckRecency(deck) {
  const sessionDate = sessionsForDeck(deck.id).map((session) => session.date || "").sort().at(-1) || "";
  return sessionDate || deck.lastUsedAt || deck.createdAt || "";
}

function sessionResultChips(session) {
  const chips = [];
  if (["champion", "second", "top4"].includes(session.placement)) {
    chips.push({ label: placementLabels[session.placement], tone: session.placement });
  }
  if (session.randomPrizeWon) chips.push({ label: "ランダム", tone: "random" });
  return chips.map(({ label, tone }) => `<span class="result-chip ${tone}">${label}</span>`).join("");
}

function sessionCardStatus(session, summary) {
  return `<span class="session-card-status"><span class="result-chip-row">${sessionResultChips(session)}</span><span class="score-pill ${recordToneClass(summary)}">${sessionRecord(session.id)}</span></span>`;
}

function sessionsForStore(storeName) {
  return state.sessions.filter((session) => session.name === storeName).sort((a, b) => b.date.localeCompare(a.date));
}

function sessionRecord(sessionId) {
  const summary = sessionSummary(sessionId);
  return `${summary.wins}-${summary.losses}${summary.draws ? `-${summary.draws}` : ""}`;
}

function sessionSummary(sessionId) {
  return summarizeMatches(matchesForSession(sessionId));
}

function recordText(summary) {
  return `${summary.wins}-${summary.losses}-${summary.draws || 0}`;
}

function recordToneClass(record) {
  if ((record.total || 0) === 0) return "neutral";
  if (record.wins > record.losses) return "positive";
  if (record.wins < record.losses) return "negative";
  return "neutral";
}

function formatDate(value) {
  return formatRecordDate(value);
}

function formatMonth(value) {
  const [year, month] = String(value).split("-");
  return year && month ? `${year}年${Number(month)}月` : "全期間";
}

function formatMonthOption(value) {
  if (value === relativeMonth(0)) return `${formatMonth(value)}（今月）`;
  if (value === relativeMonth(-1)) return `${formatMonth(value)}（前月）`;
  return formatMonth(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function summaryCard(summary, meta, compact = false) {
  const winRate = summary.winRate || 0;
  return `
    <article class="summary-card ${compact ? "compact-summary" : ""}">
      <div class="summary-top">
        <div><span class="label">戦績</span><strong class="big-number">${recordText(summary)}</strong></div>
        <div class="divider"></div>
        <div><span class="label">勝率</span><strong class="big-number">${winRate}%</strong></div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${winRate}%"></div></div>
      <div class="summary-meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>
    </article>
  `;
}

function recordStrip(summary, meta = [], badge = "") {
  return `
    <section class="record-strip">
      <div><span>戦績</span><strong>${recordText(summary)}</strong></div>
      <div><span>勝率</span><strong>${summary.winRate || 0}%</strong></div>
      <p>${meta.map((item) => `<span>${item}</span>`).join("")}</p>
      ${badge ? `<i>${escapeHtml(badge)}</i>` : ""}
    </section>
  `;
}

function renderDecks() {
  title.textContent = "デッキ選択";
  const archivedView = route.deckView === "archived";
  const visibleIds = new Set(filterDecksByArchived(state.decks, archivedView).map((deck) => deck.id));
  const visibleSessions = state.sessions.filter((session) => visibleIds.has(session.deckId));
  const visibleSessionIds = new Set(visibleSessions.map((session) => session.id));
  const visibleMatches = state.matches.filter((match) => visibleSessionIds.has(match.sessionId));
  const decks = summarizeDecks(state.decks, state.sessions, state.matches)
    .filter((deck) => visibleIds.has(deck.id))
    .sort((a, b) => deckRecency(getDeck(b.id)).localeCompare(deckRecency(getDeck(a.id))));
  const overall = summarizeMatches(visibleMatches);
  const archivedCount = filterDecksByArchived(state.decks, true).length;
  const activeCount = state.decks.length - archivedCount;

  view.innerHTML = `
    ${recordStrip(overall, [`${decks.length}デッキ`, `${visibleSessions.length}大会`, `${visibleMatches.length}試合`])}
    <div class="view-switch deck-view-switch">
      <button class="${archivedView ? "" : "active"}" type="button" data-deck-view="active">使用中 ${activeCount}</button>
      <button class="${archivedView ? "active" : ""}" type="button" data-deck-view="archived">アーカイブ ${archivedCount}</button>
    </div>
    <div class="list-stack deck-list">
      ${decks.map((deck) => `
        <button class="deck-list-card" type="button" data-open-deck="${deck.id}">
          <span class="deck-list-copy">
            <strong>${escapeHtml(deck.name)} <i>${escapeHtml(getDeck(deck.id)?.version || "v1")}</i></strong>
            <span>${deck.sessions ? `最終 ${formatDate(deckRecency(getDeck(deck.id)))}` : "未使用"}</span>
          </span>
          <span class="score-pill ${recordToneClass(deck)}">${deck.wins}-${deck.losses}</span>
        </button>
      `).join("") || `<div class="empty-card">${archivedView ? "アーカイブしたデッキはありません" : "＋ からデッキを登録しましょう"}</div>`}
    </div>
  `;
}

function renderDeckDetail(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return setRoute({ name: "decks" });
  const deckSessions = sessionsForDeck(deckId).sort((a, b) => b.date.localeCompare(a.date));
  const summary = summarizeMatches(matchesForDeck(deckId));

  title.textContent = deck.name;
  view.innerHTML = `
    ${recordStrip(summary, [escapeHtml(deck.version || "v1"), `${deckSessions.length}大会`, `${summary.total}試合`], deck.archived ? "アーカイブ" : "")}
    <div class="list-stack compact-session-list">
      ${deckSessions.map((session) => {
        const count = matchesForSession(session.id).length;
        const summary = sessionSummary(session.id);
        return `
          <button class="list-card compact-session-card" type="button" data-open-session="${session.id}">
            <span class="session-card-copy">
              <span class="session-title-line"><strong class="list-title">${escapeHtml(session.name)}</strong></span>
              <span class="list-meta"><span>${formatDate(session.date)}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${count}試合</span></span>
            </span>
            ${sessionCardStatus(session, summary)}
          </button>
        `;
      }).join("") || `<div class="empty-card">このデッキのセッションを登録しましょう</div>`}
    </div>
  `;
}

function renderSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) return setRoute({ name: "decks" });
  const rounds = matchesForSession(sessionId);
  const summary = summarizeMatches(rounds);

  title.textContent = session.name;
  view.innerHTML = `
    <section class="session-compact-head">
      <div class="session-record"><span>戦績</span><strong>${recordText(summary)}</strong><b>${summary.winRate}%</b></div>
      <button type="button" data-edit-session="${session.id}">編集</button>
      <p><span>${formatDate(session.date)}</span><span>${escapeHtml(session.deckVersion || "v1")}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${escapeHtml(session.format || "BO1")}</span></p>
      ${(session.placement || session.randomPrizeMethod || session.randomPrizeWon) ? `<div class="session-compact-outcome"><span class="result-chip-row">${sessionResultChips(session)}</span><span>${escapeHtml(placementLabels[session.placement] || session.placementNote || "")}</span><span>${escapeHtml(prizeMethodLabels[session.randomPrizeMethod] || session.randomPrizeMethodNote || "")}</span></div>` : ""}
    </section>
    <div class="section-title-row"><h2>ラウンド</h2><span>${rounds.length}試合</span></div>
    <div class="list-stack">
      ${rounds.map((match, index) => `
        <article class="round-card compact-round">
          <button class="round-main" type="button" data-edit-match="${match.id}">
            <span class="badge">${index + 1}</span>
            <span>
              <strong class="round-title">${escapeHtml(match.opponentDeck)}</strong>
              <span class="round-meta"><span>${firstLabels[match.firstPlayer]}</span></span>
            </span>
            <span class="result-pill ${match.result}">${resultLabels[match.result]}</span>
          </button>
          <details class="round-extra">
            <summary>詳細</summary>
            <div class="detail-grid">
              <span>相手: ${escapeHtml(normalizePlayerName(match.opponentPlayer))}</span>
              <span>じゃんけん: 相手${rpsLabels[match.opponentRps]}</span>
              <span>パス 自分:${passLabel(match.myPassed)} 相手:${passLabel(match.opponentPassed)}</span>
              ${match.memo ? `<span>メモ: ${escapeHtml(match.memo)}</span>` : ""}
              <button class="text-button" type="button" data-edit-match="${match.id}">編集する</button>
            </div>
          </details>
        </article>
      `).join("") || `<div class="empty-card">＋ からこのセッションの試合を記録しましょう</div>`}
    </div>
  `;
}

function renderSummary() {
  title.textContent = "分析";
  const selectedDeckId = route.deckId && getDeck(route.deckId) ? route.deckId : "";
  const deck = getDeck(selectedDeckId);
  const versions = selectedDeckId ? versionsForDeck(selectedDeckId) : [];
  const selectedVersion = route.version && versions.includes(route.version) ? route.version : "";
  const environments = selectedDeckId ? environmentsForDeck(selectedDeckId, selectedVersion) : [];
  const selectedEnvironment = route.environment && environments.includes(route.environment) ? route.environment : "";
  const stores = selectedDeckId ? storesForDeck(selectedDeckId, selectedEnvironment, selectedVersion) : [];
  const selectedStore = route.store && stores.includes(route.store) ? route.store : "";
  const months = analysisMonths();
  const selectedMonth = route.month && months.includes(route.month) ? route.month : "";
  const selectedPivot = ["opponentDeck", "myDeck", "month", "deckVersion", "environment", "store", "opponentPlayer"].includes(route.pivot) ? route.pivot : "opponentDeck";
  const selectedSort = ["total", "low", "high"].includes(route.sort) ? route.sort : "total";
  const baseMatches = analysisMatchesForDeck(selectedDeckId, selectedEnvironment, selectedStore, selectedVersion);
  const matches = filterMatchesByMonth(baseMatches, selectedMonth);
  const summary = summarizeMatches(matches);
  const passRecord = splitPassRecord(matches);
  const breakdownMatches = selectedPivot === "opponentPlayer" ? matches.filter((match) => isKnownPlayerName(match.opponentPlayer)) : matches;
  const rows = sortCrossRows(getCrossBreakdown(breakdownMatches, selectedPivot), selectedSort);

  view.innerHTML = `
    <div class="analysis-primary-filters">
      <label><span>デッキ</span><select data-analysis-deck-select>
        <option value="">全デッキ</option>
        ${state.decks.map((item) => `<option value="${item.id}" ${item.id === selectedDeckId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select></label>
      <label><span>期間</span><select data-analysis-month-select>
        <option value="">全期間</option>
        ${months.map((month) => `<option value="${month}" ${month === selectedMonth ? "selected" : ""}>${formatMonthOption(month)}</option>`).join("")}
      </select></label>
    </div>
    <details class="analysis-filter-panel">
      <summary>詳細条件${[selectedVersion, selectedEnvironment, selectedStore].filter(Boolean).length ? ` ${[selectedVersion, selectedEnvironment, selectedStore].filter(Boolean).length}` : ""}</summary>
      <div class="analysis-filter-grid">
        <label>バージョン<select data-analysis-version-select ${selectedDeckId ? "" : "disabled"}><option value="">すべて</option>${versions.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedVersion ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
        <label>環境<select data-analysis-environment-select><option value="">すべて</option>${environments.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedEnvironment ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
        <label>店舗<select data-analysis-store-select><option value="">すべて</option>${stores.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedStore ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
      </div>
    </details>

    <section class="analysis-hero">
      <div>
        <span class="label">${escapeHtml(deck?.name || "全デッキ")} / ${selectedMonth ? formatMonth(selectedMonth) : "全期間"}</span>
        <strong>${summary.winRate}%</strong>
        <small>${summary.wins}勝 ${summary.losses}敗 ${summary.draws || 0}分 / ${summary.total}戦</small>
      </div>
      <div class="mini-metrics">
        <span>先 ${summary.first.winRate}%</span>
        <span>後 ${summary.second.winRate}%</span>
      </div>
    </section>

    <section class="breakdown-panel">
      <h2>内訳</h2>
      <div class="breakdown-grid">
        ${breakdownCard("総合", recordCompact(summary), `${summary.winRate}%`)}
        ${breakdownCard("先攻", turnRecordText(summary.first), `${summary.first.winRate}%`)}
        ${breakdownCard("後攻", turnRecordText(summary.second), `${summary.second.winRate}%`)}
        ${breakdownCard("自分パス無", turnRecordText(passRecord.myNoPass), `${passRecord.myNoPass.winRate}%`)}
        ${breakdownCard("自分パス有", turnRecordText(passRecord.myAnyPass), `${passRecord.myAnyPass.winRate}%`)}
        ${breakdownCard("相手パス無", turnRecordText(passRecord.opponentNoPass), `${passRecord.opponentNoPass.winRate}%`)}
        ${breakdownCard("相手パス有", turnRecordText(passRecord.opponentAnyPass), `${passRecord.opponentAnyPass.winRate}%`)}
      </div>
    </section>

    <div class="analysis-toolbar">
      <h2 class="section-title tight-title">クロス集計</h2>
      <select data-analysis-sort aria-label="並び替え">
        ${optionTags([["total", "試合数順"], ["low", "勝率低い順"], ["high", "勝率高い順"]], selectedSort)}
      </select>
    </div>
    <div class="deck-tabs filter-tabs" aria-label="集計軸">
      ${[
        ["opponentDeck", "相手デッキ"],
        ["myDeck", "自分デッキ"],
        ["month", "月別"],
        ["deckVersion", "バージョン"],
        ["environment", "環境"],
        ["store", "店舗"],
        ["opponentPlayer", "プレイヤー"]
      ].map(([value, label]) => `
        <button class="${value === selectedPivot ? "active" : ""}" type="button" data-analysis-pivot="${value}">${label}</button>
      `).join("")}
    </div>
    <div class="matchup-list">
      ${rows.map((row) => `
        <details class="matchup-row">
          <summary>
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <span>${row.wins}勝 ${row.losses}敗 ${row.draws}分 / ${row.total}戦 ${sampleLabel(row.total)}</span>
              <span>先 ${recordCompact(row.first)} / 後 ${recordCompact(row.second)}</span>
            </div>
            <div class="matchup-rate">
              <b>${row.winRate}%</b>
              <div class="rps-track"><div class="progress-fill" style="width:${row.winRate}%"></div></div>
            </div>
          </summary>
          <div class="matchup-detail">
            <span>先攻 ${turnRecordText(row.first)}</span>
            <span>後攻 ${turnRecordText(row.second)}</span>
            <span>自分パス無 ${turnRecordText(row.myNoPass)}</span>
            <span>自分パス有 ${turnRecordText(row.myAnyPass)}</span>
            <span>相手パス無 ${turnRecordText(row.opponentNoPass)}</span>
            <span>相手パス有 ${turnRecordText(row.opponentAnyPass)}</span>
            ${selectedPivot === "store" ? `<button class="matchup-store-link" type="button" data-open-store="${escapeHtml(row.name)}">店舗アーカイブ</button>` : ""}
          </div>
        </details>
      `).join("") || `<div class="empty-card">この条件に合う試合記録がありません</div>`}
    </div>
  `;
}

function renderPlayers() {
  title.textContent = "プレイヤー";
  const selected = route.playerName;
  const months = analysisMonths();
  const selectedMonth = route.playerMonth && months.includes(route.playerMonth) ? route.playerMonth : "";
  const environments = environmentOptions();
  const selectedEnvironment = route.playerEnvironment && environments.includes(route.playerEnvironment) ? route.playerEnvironment : "";
  const periodMatches = filterMatchesByEnvironment(filterMatchesByMonth(enrichMatches(state.matches), selectedMonth), selectedEnvironment);

  if (selected) {
    title.textContent = selected;
    const record = getPlayerRecord(selected, periodMatches);
    const enriched = [...record.matches].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
    const rps = getRecordedRpsBreakdown(enriched);
    const latest = enriched[0];
    const recentDecks = uniqueValues(enriched.map((match) => match.opponentDeck)).slice(0, 3);
    const deckRows = getCrossBreakdown(enriched, "opponentDeck");
    view.innerHTML = `
      <div class="player-detail-period"><span>${selectedMonth ? formatMonth(selectedMonth) : "全期間"}・${escapeHtml(selectedEnvironment || "全環境")}</span><strong>${record.total}戦</strong></div>
      ${summaryCard(record, [`最終 ${formatDate(latest?.date)}`, `${record.total}戦`], true)}
      <div class="player-detail-actions"><button type="button" data-rename-player="${escapeHtml(selected)}">名前を変更</button></div>
      <section class="player-first-look">
        <div><strong>じゃんけん傾向</strong>${playerRpsMarkup(rps)}</div>
        <div class="recent-player-decks"><strong>最近の相手デッキ</strong><span>${recentDecks.map((name) => `<i>${escapeHtml(name)}</i>`).join("") || "記録なし"}</span></div>
      </section>
      <h2 class="section-title">相手デッキ別</h2>
      <div class="player-deck-breakdown">${deckRows.map((row) => `<div><strong>${escapeHtml(row.name)}</strong><span>${row.wins}-${row.losses} / ${row.winRate}%</span></div>`).join("") || `<div><strong>記録なし</strong><span>期間または環境を変更してください</span></div>`}</div>
      <h2 class="section-title">${escapeHtml(selected)}との履歴</h2>
      <div class="list-stack player-history-list">
        ${enriched.map((match) => {
          const session = getSession(match.sessionId);
          return `
            <button class="player-history-card" type="button" data-edit-match="${match.id}">
              <span class="player-history-copy">
                <strong>${formatDate(session?.date)}　${escapeHtml(match.myDeck)} vs ${escapeHtml(match.opponentDeck)}</strong>
                <span>${escapeHtml(session?.name || "")}・${firstLabels[match.firstPlayer]}・相手${rpsLabels[match.opponentRps]}</span>
              </span>
              <span class="result-pill ${match.result}">${resultLabels[match.result]}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  const query = String(route.playerQuery || "").trim().toLocaleLowerCase("ja");
  const sortKey = ["latest", "matches", "winRate", "name"].includes(route.playerSort) ? route.playerSort : "latest";
  const direction = route.playerDirection === "asc" ? "asc" : "desc";
  const overviewRows = getPlayerOverviews(periodMatches);
  const rows = sortPlayerOverviews(overviewRows.filter((row) => row.name.toLocaleLowerCase("ja").includes(query)), sortKey, direction);
  view.innerHTML = `
    <div class="player-toolbar">
      <input type="search" data-player-search aria-label="プレイヤーを検索" placeholder="プレイヤーを検索" value="${escapeHtml(route.playerQuery || "")}">
      <select data-player-sort aria-label="並び順">${optionTags([["latest", "最終対戦日"], ["matches", "対戦数"], ["winRate", "勝率"], ["name", "名前"]], sortKey)}</select>
      <button type="button" data-player-direction aria-label="${direction === "desc" ? "降順" : "昇順"}">${direction === "desc" ? "↓" : "↑"}</button>
    </div>
    <div class="player-context-filters">
      <label><span>期間</span><select data-player-month aria-label="期間"><option value="">全期間</option>${months.map((month) => `<option value="${month}" ${month === selectedMonth ? "selected" : ""}>${formatMonthOption(month)}</option>`).join("")}</select></label>
      <label><span>環境</span><select data-player-environment aria-label="環境"><option value="">全環境</option>${environments.map((environment) => `<option value="${escapeHtml(environment)}" ${environment === selectedEnvironment ? "selected" : ""}>${escapeHtml(environment)}</option>`).join("")}</select></label>
    </div>
    <div class="list-stack player-list">
      ${rows.map((row) => `
        <button class="player-list-card ${query ? "search-result" : ""}" type="button" data-open-player="${escapeHtml(row.name)}">
          <span class="player-list-copy">
            <strong>${escapeHtml(row.name)}</strong>
            <span>最終 ${formatDate(row.latestMatch?.date)}・${escapeHtml(row.latestMatch?.opponentDeck || "デッキ不明")}・${escapeHtml(row.latestMatch?.store || "場所不明")}</span>
            ${query ? playerRpsMarkup(row.recordedRps, true) : ""}
          </span>
          <span class="score-pill ${playerWinRateTone(row.winRate)}">${row.winRate}%<small>${row.wins}-${row.losses} / ${row.total}戦</small></span>
        </button>
      `).join("") || `<div class="empty-card">${query ? "該当するプレイヤーがいません" : selectedMonth || selectedEnvironment ? "この条件のプレイヤー記録はありません" : "試合記録に相手プレイヤー名を入れると、ここに履歴が出ます"}</div>`}
    </div>
  `;
}

function playerRpsMarkup(rps, compact = false) {
  return `<div class="player-rps ${compact ? "quick" : ""}"><div class="rps-stack" aria-label="相手のじゃんけん傾向">${rps.rows.map((row) => `<span class="rps-segment ${row.key}" style="width:${row.percentage}%" title="${row.label} ${row.percentage}%"></span>`).join("")}</div><div class="player-rps-labels">${rps.rows.map((row) => `<span>${row.label} ${row.percentage}%</span>`).join("")}<span>${rps.total}戦</span></div></div>`;
}

function renderSessions() {
  title.textContent = "大会";
  const selectedView = route.view === "stores" ? "stores" : "sessions";
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `
    <div class="view-switch" aria-label="大会表示">
      <button class="${selectedView === "sessions" ? "active" : ""}" type="button" data-tournament-view="sessions">セッション</button>
      <button class="${selectedView === "stores" ? "active" : ""}" type="button" data-tournament-view="stores">店舗</button>
    </div>
    ${selectedView === "stores" ? renderStoreList() : `<div class="list-stack compact-session-list">
      ${sessions.map((session) => {
        const deck = getDeck(session.deckId);
        const summary = sessionSummary(session.id);
        return `
          <button class="list-card compact-session-card" type="button" data-open-session="${session.id}">
            <span class="session-card-copy">
              <span class="session-title-line"><strong class="list-title">${escapeHtml(session.name)}</strong></span>
              <span class="list-meta"><span>${formatDate(session.date)}</span><span>${escapeHtml(deck?.name || "未設定")}</span></span>
            </span>
            ${sessionCardStatus(session, summary)}
          </button>
        `;
      }).join("") || `<div class="empty-card">＋ からセッションを登録しましょう</div>`}</div>`}
  `;
}

function renderStoreList() {
  const stores = uniqueValues(state.sessions.map((session) => session.name)).map((name) => {
    const sessions = sessionsForStore(name);
    const latest = sessions[0];
    return { name, sessions, latest };
  }).sort((a, b) => (b.latest?.date || "").localeCompare(a.latest?.date || ""));
  return `<div class="list-stack store-list">${stores.map((store) => `
    <button class="store-card" type="button" data-open-store="${escapeHtml(store.name)}">
      <span><strong>${escapeHtml(store.name)}</strong><small>${store.sessions.length}回開催・最終 ${formatDate(store.latest?.date)}</small></span>
      <span class="chevron">›</span>
    </button>`).join("") || `<div class="empty-card">セッションを登録すると店舗履歴が表示されます</div>`}</div>`;
}

function renderStoreDetail(storeName) {
  const sessions = sessionsForStore(storeName);
  const breakdown = getStaffRpsBreakdown(sessions);
  const recordedHands = breakdown.filter((hand) => hand.total > 0);
  const hasRpsArchive = sessions.some((session) => session.randomPrizeMethod === "rps");
  const methodCounts = Object.entries(sessions.reduce((counts, session) => {
    const method = session.randomPrizeMethod || "unrecorded";
    counts[method] = (counts[method] || 0) + 1;
    return counts;
  }, {}));
  title.textContent = storeName;
  view.innerHTML = `
    <section class="store-summary"><strong>${sessions.length}</strong><span>開催記録</span><div class="method-chips">${methodCounts.map(([method, count]) => `<span>${escapeHtml(prizeMethodLabels[method] || method)} ${count}回</span>`).join("") || `<span>方式未記録</span>`}</div></section>
    ${recordedHands.length ? `<h2 class="section-title">店員の手</h2><section class="staff-rps-card">${recordedHands.map((hand) => staffHandBar(hand)).join("")}</section>` : hasRpsArchive ? `<div class="store-inline-empty">じゃんけんの手は未記録です</div>` : ""}
    <h2 class="section-title">開催履歴</h2>
    <div class="list-stack compact-session-list">${sessions.map((session) => {
      const summary = sessionSummary(session.id);
      const deck = getDeck(session.deckId);
      return `<button class="list-card compact-session-card" type="button" data-open-session="${session.id}"><span class="session-card-copy"><span class="session-title-line"><strong class="list-title">${formatDate(session.date)}</strong></span><span class="list-meta"><span>${escapeHtml(prizeMethodLabels[session.randomPrizeMethod] || "方式未記録")}</span><span>${escapeHtml(deck?.name || "デッキ未設定")}</span><span>${escapeHtml(session.environment || "環境未設定")}</span></span></span>${sessionCardStatus(session, summary)}</button>`;
    }).join("")}</div>`;
}

function staffHandBar(hand) {
  return `<div class="staff-hand-row"><div class="staff-hand-head"><strong>${hand.position}手目</strong><span>${hand.total}回</span></div><div class="rps-stack">${hand.rows.map((row) => `<span class="rps-segment ${row.key}" style="width:${row.percentage}%" title="${row.label} ${row.percentage}%"></span>`).join("")}</div><div class="staff-hand-legend">${hand.rows.map((row) => `<span>${row.label} ${row.percentage}%</span>`).join("")}</div></div>`;
}

function render() {
  updateSuggestions();
  renderSyncStatus();
  const currentDeck = route.name === "deckDetail" ? getDeck(route.deckId) : null;
  const hasBackButton = ["deckDetail", "session", "playerDetail", "storeDetail"].includes(route.name);
  view.classList.toggle("player-index-screen", route.name === "players");
  topBar.classList.toggle("root-header", !hasBackButton);
  backButton.style.visibility = hasBackButton ? "visible" : "hidden";
  fabButton.hidden = route.name === "summary" || route.name === "players" || route.name === "playerDetail" || route.name === "storeDetail" || (route.name === "sessions" && route.view === "stores") || Boolean(currentDeck?.archived);
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.nav === rootNavName()));

  if (route.name === "decks") renderDecks();
  if (route.name === "deckDetail") renderDeckDetail(route.deckId);
  if (route.name === "session") renderSession(route.sessionId);
  if (route.name === "summary") renderSummary();
  if (route.name === "players" || route.name === "playerDetail") renderPlayers();
  if (route.name === "sessions") renderSessions();
  if (route.name === "storeDetail") renderStoreDetail(route.storeName);
}

function rootNavName() {
  if (route.name === "deckDetail") return "decks";
  if (route.name === "session") return "sessions";
  if (route.name === "playerDetail") return "players";
  if (route.name === "storeDetail") return "sessions";
  return route.name;
}

function analysisRoute(overrides = {}) {
  return {
    name: "summary",
    deckId: route.deckId || "",
    version: route.version || "",
    environment: route.environment || "",
    store: route.store || "",
    month: route.month || "",
    pivot: route.pivot || "opponentDeck",
    sort: route.sort || "total",
    ...overrides
  };
}

function openDialog(mode, targetId = null) {
  updateSuggestions();
  dialogMode = mode;
  editingMatchId = mode === "match" ? targetId : null;
  editingSessionId = mode === "session" ? targetId : null;
  dialogFields.innerHTML = "";
  dialogSubmit.textContent = "保存";
  dialogSubmit.hidden = false;

  if (mode === "deck") {
    dialogKicker.textContent = "Deck";
    dialogTitle.textContent = "デッキ登録";
    dialogFields.innerHTML = `
      <label>デッキ名<input name="name" required placeholder="例: 高木婚活"></label>
      <label>初期バージョン<input name="version" required value="v1" placeholder="例: v1 / 新弾後"></label>
    `;
  }

  if (mode === "playerRename") {
    dialogKicker.textContent = "Player";
    dialogTitle.textContent = "プレイヤー名を変更";
    dialogSubmit.textContent = "変更";
    const currentName = targetId || route.playerName || "";
    dialogFields.innerHTML = `
      <input type="hidden" name="currentPlayerName" value="${escapeHtml(currentName)}">
      <label>新しい名前<input name="playerName" list="playerSuggestions" required value="${escapeHtml(currentName)}"></label>
      <p class="form-note">既存の名前を指定すると、そのプレイヤーへ履歴を統合します。</p>
    `;
  }

  if (mode === "menu") {
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "メニュー";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `
      <div class="short-menu">${menuRowsMarkup()}</div>
      <div class="menu-note"><strong>自動保存</strong><span>入力内容はこの端末に保存されます。</span></div>
    `;
  }

  if (["deckSettings", "sessionSettings"].includes(mode)) {
    dialogKicker.textContent = "Page";
    dialogTitle.textContent = mode === "deckSettings" ? "デッキ設定" : "セッション設定";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `<button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>${routeActionMarkup()}`;
  }

  if (mode === "cloudSettings") {
    dialogKicker.textContent = "Cloud";
    dialogTitle.textContent = "クラウド同期";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `<button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>${cloudMenuMarkup()}`;
  }

  if (mode === "dataSettings") {
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "環境・データ管理";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `<button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>${dataSettingsMarkup()}`;
  }

  if (mode === "session") {
    dialogSubmit.hidden = false;
    dialogKicker.textContent = "Session";
    const editingSession = editingSessionId ? getSession(editingSessionId) : null;
    dialogTitle.textContent = editingSession ? "セッション編集" : "セッション登録";
    dialogSubmit.textContent = editingSession ? "更新" : "保存";
    const activeDecks = filterDecksByArchived(state.decks);
    const deckId = route.deckId || activeDecks[0]?.id || "";
    const fixedDeck = editingSession ? getDeck(editingSession.deckId) : route.name === "deckDetail" ? getDeck(route.deckId) : null;
    dialogFields.innerHTML = `
      ${fixedDeck ? `
        <div class="locked-field">
          <span>使用デッキ</span>
          <strong>${escapeHtml(fixedDeck.name)}</strong>
          <small>${escapeHtml(editingSession?.deckVersion || fixedDeck.version || "v1")}</small>
          <input type="hidden" name="deckId" value="${fixedDeck.id}">
        </div>
      ` : `
        <label>使用デッキ<select name="deckId" required>${activeDecks.map((deck) => `<option value="${deck.id}" ${deck.id === deckId ? "selected" : ""}>${escapeHtml(deck.name)}</option>`).join("")}</select></label>
      `}
      <label>大会名/店舗名<input name="name" list="sessionNameSuggestions" required placeholder="例: 秋葉原チェルモ" value="${escapeHtml(editingSession?.name || "")}"></label>
      <label>環境<input name="environment" list="environmentSuggestions" required placeholder="例: 第3弾環境" value="${escapeHtml(editingSession?.environment || preferredEnvironment())}"></label>
      <div class="inline-fields">
        <label>日付<input type="date" name="date" required value="${editingSession?.date || new Date().toISOString().slice(0, 10)}"></label>
        <label>形式<select name="format">${optionTags([["BO1", "BO1"], ["BO3", "BO3"]], editingSession?.format || "BO1")}</select></label>
      </div>
      <details class="session-result-fields" ${editingSession?.placement || editingSession?.randomPrizeMethod ? "open" : ""}>
        <summary>大会結果・ランダム賞</summary>
        <label>大会結果<select name="placement" data-placement-select>${optionTags([["", "未記録"], ["champion", "優勝"], ["second", "2位"], ["top4", "ベスト4"], ["other", "その他"]], editingSession?.placement || "")}</select></label>
        <label>その他の結果<input name="placementNote" placeholder="例: ベスト8" value="${escapeHtml(editingSession?.placementNote || "")}"></label>
        <label class="check-field"><input type="checkbox" name="randomPrizeWon" ${editingSession?.randomPrizeWon ? "checked" : ""} ${canWinRandomPrize(editingSession?.placement) ? "" : "disabled"}>ランダム賞を獲得</label>
        <label>決定方法<select name="randomPrizeMethod">${optionTags([["", "未記録"], ["rps", "じゃんけん"], ["roulette", "ルーレット"], ["other", "その他"]], editingSession?.randomPrizeMethod || "")}</select></label>
        <label>決定方法の補足<input name="randomPrizeMethodNote" placeholder="その他の方式など" value="${escapeHtml(editingSession?.randomPrizeMethodNote || "")}"></label>
        <div class="staff-hand-fields">
          ${[0, 1, 2].map((index) => `<label>${index + 1}手目<select name="staffRps${index + 1}">${optionTags([["", "未記録"], ["rock", "グー"], ["scissors", "チョキ"], ["paper", "パー"]], editingSession?.staffRpsHands?.[index] || "")}</select></label>`).join("")}
        </div>
      </details>
    `;
  }

  if (mode === "match") {
    dialogSubmit.hidden = false;
    const session = getSession(route.sessionId) || state.sessions[0];
    const deck = getDeck(session?.deckId);
    const editingMatch = editingMatchId ? state.matches.find((match) => match.id === editingMatchId) : null;
    dialogKicker.textContent = "Round";
    dialogTitle.textContent = editingMatch ? "勝敗を編集" : "勝敗登録";
    dialogSubmit.textContent = editingMatch ? "更新" : "保存";
    dialogFields.innerHTML = `
      <input type="hidden" name="myDeck" value="${escapeHtml(editingMatch?.myDeck || deck?.name || "")}">
      <label>相手デッキ<input name="opponentDeck" list="opponentDeckSuggestions" required placeholder="例: 婚活警視庁" value="${escapeHtml(editingMatch?.opponentDeck || "")}"></label>
      <div class="inline-fields">
        <label>勝敗<select name="result" required>${requiredOptionTags([["win", "Win"], ["loss", "Lose"], ["draw", "Draw"]], editingMatch?.result || "", "選択")}</select></label>
        <label>先/後<select name="firstPlayer" required>${requiredOptionTags([["first", "先攻"], ["second", "後攻"]], editingMatch?.firstPlayer || "", "選択")}</select></label>
      </div>
      <details class="match-extra-fields" ${editingMatch ? "open" : ""}>
        <summary>対戦相手・詳細記録</summary>
        <label>相手プレイヤーネーム<input name="opponentPlayer" list="playerSuggestions" value="${escapeHtml(normalizePlayerName(editingMatch?.opponentPlayer))}"></label>
        <label>じゃんけんで相手の出した手<select name="opponentRps">${optionTags([["unknown", "未記録"], ["rock", "グー"], ["scissors", "チョキ"], ["paper", "パー"]], editingMatch?.opponentRps || "unknown")}</select></label>
        <div class="inline-fields">
          <label>自分のパス<select name="myPassed">${passOptions(editingMatch?.myPassed || "none")}</select></label>
          <label>相手のパス<select name="opponentPassed">${passOptions(editingMatch?.opponentPassed || "none")}</select></label>
        </div>
        <label>メモ<textarea name="memo" rows="3" placeholder="印象的だった展開、敗因など">${escapeHtml(editingMatch?.memo || "")}</textarea></label>
      </details>
      ${editingMatch ? `<button class="danger-button" type="button" data-delete-editing-match>この試合を削除</button>` : ""}
    `;
  }

  dialog.scrollTop = 0;
  entryForm.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
}

entryForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const data = new FormData(entryForm);

  if (dialogMode === "deck") {
    const now = new Date().toISOString();
    const deck = {
      id: crypto.randomUUID(),
      name: data.get("name").trim(),
      version: data.get("version").trim() || "v1",
      color: "purple",
      archived: false,
      createdAt: now,
      lastUsedAt: now
    };
    state.decks.push(deck);
    route = { name: "deckDetail", deckId: deck.id };
  }

  if (dialogMode === "playerRename") {
    const currentName = data.get("currentPlayerName").trim();
    const nextName = data.get("playerName").trim();
    if (!isKnownPlayerName(nextName)) return;
    state.matches = state.matches.map((match) => match.opponentPlayer === currentName ? { ...match, opponentPlayer: nextName } : match);
    route = { ...route, name: "playerDetail", playerName: nextName };
  }

  if (dialogMode === "session") {
    const selectedDeck = getDeck(data.get("deckId"));
    const currentSession = editingSessionId ? getSession(editingSessionId) : null;
    const randomPrizeMethod = data.get("randomPrizeMethod") || "";
    const session = {
      id: editingSessionId || crypto.randomUUID(),
      deckId: data.get("deckId"),
      deckVersion: currentSession?.deckVersion || selectedDeck?.version || "v1",
      name: data.get("name").trim(),
      date: data.get("date"),
      format: data.get("format"),
      environment: data.get("environment").trim(),
      placement: data.get("placement") || "",
      placementNote: data.get("placementNote").trim(),
      randomPrizeWon: canWinRandomPrize(data.get("placement")) && data.get("randomPrizeWon") === "on",
      randomPrizeMethod,
      randomPrizeMethodNote: data.get("randomPrizeMethodNote").trim(),
      staffRpsHands: randomPrizeMethod === "rps" ? [data.get("staffRps1"), data.get("staffRps2"), data.get("staffRps3")] : ["", "", ""]
    };
    addEnvironment(session.environment);
    if (editingSessionId) {
      state.sessions = state.sessions.map((current) => (current.id === editingSessionId ? session : current));
    } else {
      state.sessions.push(session);
    }
    state.decks = state.decks.map((deck) => deck.id === session.deckId ? { ...deck, lastUsedAt: session.date } : deck);
    route = { name: "session", sessionId: session.id };
  }

  if (dialogMode === "match") {
    const nextMatch = {
      id: crypto.randomUUID(),
      sessionId: route.sessionId,
      myDeck: data.get("myDeck").trim(),
      opponentDeck: data.get("opponentDeck").trim(),
      opponentPlayer: normalizePlayerName(data.get("opponentPlayer")),
      result: data.get("result"),
      firstPlayer: data.get("firstPlayer"),
      opponentRps: data.get("opponentRps"),
      myPassed: data.get("myPassed"),
      opponentPassed: data.get("opponentPassed"),
      memo: data.get("memo").trim()
    };

    if (editingMatchId) {
      state.matches = state.matches.map((match) => (
        match.id === editingMatchId ? { ...match, ...nextMatch, id: editingMatchId, sessionId: match.sessionId } : match
      ));
    } else {
      state.matches.push(nextMatch);
    }
  }

  saveState();
  dialog.close();
  entryForm.reset();
  render();
});

view.addEventListener("click", (event) => {
  const deckButton = event.target.closest("[data-open-deck]");
  const sessionButton = event.target.closest("[data-open-session]");
  const playerButton = event.target.closest("[data-open-player]");
  const editButton = event.target.closest("[data-edit-match]");
  const editSessionButton = event.target.closest("[data-edit-session]");
  const analysisPivotButton = event.target.closest("[data-analysis-pivot]");
  const renamePlayerButton = event.target.closest("[data-rename-player]");
  const playerDirectionButton = event.target.closest("[data-player-direction]");
  const deckViewButton = event.target.closest("[data-deck-view]");
  const tournamentViewButton = event.target.closest("[data-tournament-view]");
  const storeButton = event.target.closest("[data-open-store]");
  if (deckButton) setRoute({ name: "deckDetail", deckId: deckButton.dataset.openDeck, returnDeckView: route.deckView || "active" });
  if (sessionButton) setRoute({ name: "session", sessionId: sessionButton.dataset.openSession, returnStore: route.name === "storeDetail" ? route.storeName : "", returnAfterStore: route.name === "storeDetail" ? route.returnRoute : null });
  if (playerButton) setRoute({ ...route, name: "playerDetail", playerName: playerButton.dataset.openPlayer });
  if (editButton) openDialog("match", editButton.dataset.editMatch);
  if (editSessionButton) openDialog("session", editSessionButton.dataset.editSession);
  if (analysisPivotButton) setRoute(analysisRoute({ pivot: analysisPivotButton.dataset.analysisPivot }));
  if (renamePlayerButton) openDialog("playerRename", renamePlayerButton.dataset.renamePlayer);
  if (playerDirectionButton) setRoute({ ...route, name: "players", playerName: "", playerDirection: route.playerDirection === "asc" ? "desc" : "asc" });
  if (deckViewButton) setRoute({ name: "decks", deckView: deckViewButton.dataset.deckView === "archived" ? "archived" : "active" });
  if (tournamentViewButton) setRoute({ name: "sessions", view: tournamentViewButton.dataset.tournamentView });
  if (storeButton) setRoute({ name: "storeDetail", storeName: storeButton.dataset.openStore, returnRoute: route.name === "summary" ? { ...route } : null });
});

view.addEventListener("change", (event) => {
  const sortSelect = event.target.closest("[data-analysis-sort]");
  if (sortSelect) setRoute(analysisRoute({ sort: sortSelect.value }));
  const deckSelect = event.target.closest("[data-analysis-deck-select]");
  if (deckSelect) setRoute(analysisRoute({ deckId: deckSelect.value, version: "", environment: "", store: "" }));
  const monthSelect = event.target.closest("[data-analysis-month-select]");
  if (monthSelect) setRoute(analysisRoute({ month: monthSelect.value }));
  const versionSelect = event.target.closest("[data-analysis-version-select]");
  if (versionSelect) setRoute(analysisRoute({ version: versionSelect.value, store: "" }));
  const environmentSelect = event.target.closest("[data-analysis-environment-select]");
  if (environmentSelect) setRoute(analysisRoute({ environment: environmentSelect.value, store: "" }));
  const storeSelect = event.target.closest("[data-analysis-store-select]");
  if (storeSelect) setRoute(analysisRoute({ store: storeSelect.value }));
  const playerSort = event.target.closest("[data-player-sort]");
  if (playerSort) setRoute({ ...route, name: "players", playerName: "", playerSort: playerSort.value });
  const playerMonth = event.target.closest("[data-player-month]");
  if (playerMonth) setRoute({ ...route, name: "players", playerName: "", playerMonth: playerMonth.value });
  const playerEnvironment = event.target.closest("[data-player-environment]");
  if (playerEnvironment) setRoute({ ...route, name: "players", playerName: "", playerEnvironment: playerEnvironment.value });
});

view.addEventListener("input", (event) => {
  const search = event.target.closest("[data-player-search]");
  if (!search) return;
  route = { ...route, name: "players", playerName: "", playerQuery: search.value };
  renderPlayers();
  queueMicrotask(() => {
    const nextSearch = view.querySelector("[data-player-search]");
    nextSearch?.focus();
    nextSearch?.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
  });
});

dialogFields.addEventListener("change", (event) => {
  const placement = event.target.closest("[data-placement-select]");
  if (!placement) return;
  const prize = dialogFields.querySelector("input[name='randomPrizeWon']");
  if (!prize) return;
  prize.disabled = !canWinRandomPrize(placement.value);
  if (prize.disabled) prize.checked = false;
});

dialogFields.addEventListener("focusin", (event) => {
  const playerInput = event.target.closest("input[name='opponentPlayer']");
  if (playerInput?.value === "不明") playerInput.select();
});

dialogFields.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-guide]")) {
    window.location.href = "./guide.html";
    return;
  }

  const menuPanelButton = event.target.closest("[data-open-menu-panel]");
  if (menuPanelButton) {
    openDialog(menuPanelButton.dataset.openMenuPanel);
    return;
  }

  if (event.target.closest("[data-save-cloud-config]")) {
    const url = dialogFields.querySelector("input[name='supabaseUrl']").value;
    const anonKey = dialogFields.querySelector("input[name='supabaseAnonKey']").value;
    if (!url.trim() || !anonKey.trim()) {
      cloudMessage = "Supabase URLとAnon keyを入力してください";
      openDialog("cloudSettings");
      return;
    }
    saveCloudConfig(url, anonKey);
    cloudMessage = "Supabase設定を保存しました";
    refreshCloudSession();
    openDialog("cloudSettings");
    return;
  }

  if (event.target.closest("[data-cloud-login]")) {
    const input = dialogFields.querySelector("input[name='cloudEmail']");
    const email = input.value.trim();
    if (!email) {
      input.setCustomValidity("メールアドレスを入力してください");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    signInWithEmail(email)
      .then(() => {
        cloudMessage = "ログイン用メールを送信しました";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = `ログイン失敗: ${error.message}`;
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-cloud-download]")) {
    pullCloudState();
    return;
  }

  if (event.target.closest("[data-cloud-use-remote]")) {
    if (!pendingRemoteState) return;
    const local = pendingRemoteState.localSummary;
    const confirmed = confirm(`クラウドの内容を使用しますか？\nこの端末の ${local.decks}デッキ・${local.sessions}大会・${local.matches}試合 は置き換わります。`);
    if (!confirmed) return;
    usePendingRemoteState();
    openDialog("cloudSettings");
    return;
  }

  if (event.target.closest("[data-cloud-upload]")) {
    pushCloudState();
    return;
  }

  if (event.target.closest("[data-cloud-force-upload]")) {
    const confirmed = confirm("クラウド上の内容を、この端末のデータで上書きしますか？");
    if (confirmed) pushCloudState({ force: true });
    return;
  }

  if (event.target.closest("[data-cloud-logout]")) {
    signOutCloud()
      .then((nextStatus) => {
        cloudStatus = nextStatus;
        cloudUpdatedAt = null;
        saveSyncMeta();
        cloudConflict = false;
        pendingRemoteState = null;
        cloudMessage = "ログアウトしました";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = `ログアウト失敗: ${error.message}`;
        openDialog("cloudSettings");
      });
    return;
  }

  const deleteDeckButton = event.target.closest("[data-delete-current-deck]");
  if (deleteDeckButton) {
    const deck = getDeck(deleteDeckButton.dataset.deleteCurrentDeck);
    if (!deck) return;
    const sessionCount = sessionsForDeck(deck.id).length;
    const matchCount = matchesForDeck(deck.id).length;
    const confirmed = confirm(`「${deck.name}」を削除しますか？\n関連する${sessionCount}セッション、${matchCount}試合も削除されます。`);
    if (!confirmed) return;
    deleteDeck(deck.id);
    saveState();
    dialog.close();
    route = { name: "decks" };
    render();
    return;
  }

  const archiveDeckButton = event.target.closest("[data-toggle-deck-archive]");
  if (archiveDeckButton) {
    const deck = getDeck(archiveDeckButton.dataset.toggleDeckArchive);
    if (!deck) return;
    state.decks = state.decks.map((item) => item.id === deck.id ? { ...item, archived: !deck.archived } : item);
    saveState();
    dialog.close();
    render();
    return;
  }

  const deleteSessionButton = event.target.closest("[data-delete-current-session]");
  if (deleteSessionButton) {
    const session = getSession(deleteSessionButton.dataset.deleteCurrentSession);
    if (!session) return;
    const matchCount = matchesForSession(session.id).length;
    const deckId = session.deckId;
    const confirmed = confirm(`「${session.name}」を削除しますか？\nこのセッションの${matchCount}試合も削除されます。`);
    if (!confirmed) return;
    deleteSession(session.id);
    saveState();
    dialog.close();
    route = getDeck(deckId) ? { name: "deckDetail", deckId } : { name: "sessions" };
    render();
    return;
  }

  if (event.target.closest("[data-import-json]")) {
    const input = dialogFields.querySelector("textarea[name='importJson']");
    try {
      const imported = normalizeState(JSON.parse(input.value));
      state = imported;
      saveState();
      updateSuggestions();
      dialog.close();
      route = { name: "decks" };
      render();
    } catch {
      input.setCustomValidity("JSONの形式を確認してください");
      input.reportValidity();
      input.setCustomValidity("");
    }
    return;
  }

  if (event.target.closest("[data-add-environment]")) {
    const input = dialogFields.querySelector("input[name='newEnvironment']");
    const value = input.value.trim();
    if (!value) return;
    addEnvironment(value);
    saveState();
    updateSuggestions();
    openDialog("dataSettings");
    return;
  }

  if (event.target.closest("[data-update-deck]")) {
    const deck = getDeck(event.target.closest("[data-update-deck]").dataset.updateDeck);
    const name = dialogFields.querySelector("input[name='deckName']")?.value.trim();
    const version = dialogFields.querySelector("input[name='deckVersion']")?.value.trim();
    if (!deck || !name || !version) return;
    const sessionIds = new Set(sessionsForDeck(deck.id).map((session) => session.id));
    state.decks = state.decks.map((item) => item.id === deck.id ? { ...item, name, version } : item);
    state.matches = state.matches.map((match) => sessionIds.has(match.sessionId) ? { ...match, myDeck: name } : match);
    saveState();
    title.textContent = name;
    cloudMessage = `デッキ設定を更新しました。新規セッションは${version}で記録されます`;
    openDialog("deckSettings");
    return;
  }

  if (event.target.closest("[data-merge-names]")) {
    const field = dialogFields.querySelector("[name='mergeType']").value;
    const from = dialogFields.querySelector("input[name='mergeFrom']").value.trim();
    const to = dialogFields.querySelector("input[name='mergeTo']").value.trim();
    if (!from || !to || from === to) return;
    const affected = state.matches.filter((match) => String(match[field] || "").trim() === from).length;
    state.matches = state.matches.map((match) => (
      String(match[field] || "").trim() === from ? { ...match, [field]: to } : match
    ));
    saveState();
    cloudMessage = `${affected}試合の名称を「${to}」へ統合しました`;
    openDialog("dataSettings");
    return;
  }

  if (event.target.closest("[data-copy-export]")) {
    const payload = JSON.stringify(state, null, 2);
    navigator.clipboard?.writeText(payload);
    event.target.textContent = "コピー済み";
    setTimeout(() => {
      event.target.textContent = "JSONをコピー";
    }, 1000);
    return;
  }

  if (!event.target.closest("[data-delete-editing-match]") || !editingMatchId) return;
  state.matches = state.matches.filter((match) => match.id !== editingMatchId);
  saveState();
  dialog.close();
  entryForm.reset();
  editingMatchId = null;
  render();
});

fabButton.addEventListener("click", () => {
  if (route.name === "decks") openDialog("deck");
  if (route.name === "deckDetail") openDialog("session");
  if (route.name === "sessions") openDialog("session");
  if (route.name === "session") openDialog("match");
});

backButton.addEventListener("click", () => {
  if (route.name === "deckDetail") setRoute({ name: "decks", deckView: route.returnDeckView || "active" });
  if (route.name === "session") {
    const session = getSession(route.sessionId);
    if (route.returnStore) setRoute({ name: "storeDetail", storeName: route.returnStore, returnRoute: route.returnAfterStore });
    else setRoute(session ? { name: "deckDetail", deckId: session.deckId } : { name: "sessions" });
  }
  if (route.name === "playerDetail") setRoute({ name: "players", playerQuery: route.playerQuery || "", playerSort: route.playerSort || "latest", playerDirection: route.playerDirection || "desc", playerMonth: route.playerMonth || "", playerEnvironment: route.playerEnvironment || "" });
  if (route.name === "storeDetail") setRoute(route.returnRoute || { name: "sessions", view: "stores" });
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => setRoute({ name: button.dataset.nav }));
});

document.querySelector("#moreButton").addEventListener("click", () => {
  openDialog("menu");
});

window.addEventListener("online", handleOnlineRecovery);
window.addEventListener("offline", renderSyncStatus);

async function handleOnlineRecovery() {
  renderSyncStatus();
  if (isCloudConfigured() && !cloudStatus.signedIn) {
    await refreshCloudSession();
    return;
  }
  if (!cloudStatus.signedIn || !localDirty || cloudConflict) return;
  cloudMessage = "オンライン復帰・再同期中";
  if (cloudUpdatedAt) scheduleCloudSave();
  else pullCloudState({ uploadWhenEmpty: true, silent: true });
}

localStorage.setItem(storageKey, JSON.stringify(state));
render();
registerServiceWorker();
refreshCloudSession();

function passOptions(selected = "none") {
  return [
    ["none", "無し"],
    ["pass1", "1パス"],
    ["pass2", "2パス"],
    ["pass3", "3パス"],
    ["pass12", "1&2パス"]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function passLabel(value) {
  return passLabels[String(value)] || "無し";
}

function optionTags(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function requiredOptionTags(options, selected, placeholder) {
  return `<option value="" ${selected ? "" : "selected"} disabled>${placeholder}</option>${optionTags(options, selected)}`;
}

function environmentOptions() {
  return uniqueValues([...(state.environments || []), ...state.sessions.map((session) => session.environment)]);
}

function preferredEnvironment() {
  return environmentOptions()[0] || "未設定";
}

function addEnvironment(environment) {
  state.environments = uniqueValues([...(state.environments || []), environment]);
}

function stageRemoteReconciliation(remote) {
  const remoteState = normalizeState(remote.data);
  if (statesEqual(state, remoteState)) {
    state = remoteState;
    localStorage.setItem(storageKey, JSON.stringify(state));
    markCloudSynced(remote.updated_at);
    cloudConflict = false;
    pendingRemoteState = null;
    return false;
  }

  pendingRemoteState = {
    data: remoteState,
    updatedAt: remote.updated_at,
    localSummary: stateSummary(state),
    remoteSummary: stateSummary(remoteState)
  };
  cloudUpdatedAt = remote.updated_at;
  saveSyncMeta();
  cloudConflict = true;
  cloudMessage = "端末とクラウドに異なるデータがあります";
  return true;
}

function usePendingRemoteState() {
  if (!pendingRemoteState) return;
  state = pendingRemoteState.data;
  localStorage.setItem(storageKey, JSON.stringify(state));
  markCloudSynced(pendingRemoteState.updatedAt);
  pendingRemoteState = null;
  cloudConflict = false;
  cloudMessage = "クラウドの内容をこの端末へ反映しました";
  route = validRouteAfterSync(route);
  render();
}

async function refreshCloudSession() {
  if (!isCloudConfigured()) {
    cloudStatus = cloudSnapshot("local");
    return;
  }

  try {
    cloudStatus = await initializeCloud((nextStatus) => {
      cloudStatus = nextStatus;
      rerenderOpenMenu();
    });
    if (cloudStatus.signedIn) await pullCloudState({ uploadWhenEmpty: true, silent: true });
    rerenderOpenMenu();
  } catch (error) {
    cloudMessage = `クラウド接続失敗: ${error.message}`;
    rerenderOpenMenu();
  }
}

async function pullCloudState(options = {}) {
  const { uploadWhenEmpty = false, silent = false } = options;
  try {
    if (!silent) {
      cloudMessage = "クラウド読込中";
      rerenderOpenMenu();
    }
    const remote = await loadCloudState();
    if (remote?.data) {
      const needsChoice = stageRemoteReconciliation(remote);
      if (needsChoice) {
        renderSyncStatus();
        openDialog("cloudSettings");
        return;
      }
      cloudMessage = `クラウドと同期済み ${formatSyncTime(remote.updated_at)}`;
      route = validRouteAfterSync(route);
      render();
      rerenderOpenMenu();
      return;
    }

    if (uploadWhenEmpty) {
      await pushCloudState({ silent: true });
      cloudMessage = "この端末のデータをクラウドへ保存しました";
    } else {
      cloudMessage = "クラウドにデータはまだありません";
    }
    rerenderOpenMenu();
  } catch (error) {
    cloudMessage = `クラウド読込失敗: ${error.message}`;
    rerenderOpenMenu();
  }
}

async function pushCloudState(options = {}) {
  const { silent = false, force = false } = options;
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    if (!silent) {
      cloudMessage = "クラウド保存中";
      rerenderOpenMenu();
    }
    const updatedAt = await saveCloudState(snapshot, {
      expectedUpdatedAt: cloudUpdatedAt,
      force
    });
    cloudUpdatedAt = updatedAt;
    cloudConflict = false;
    pendingRemoteState = null;
    if (statesEqual(snapshot, state)) {
      markCloudSynced(updatedAt);
    } else {
      localDirty = true;
      saveSyncMeta();
      scheduleCloudSave();
    }
    cloudMessage = localDirty ? "続きの変更をクラウド保存待ち" : `クラウド保存済み ${formatSyncTime(updatedAt)}`;
    rerenderOpenMenu();
  } catch (error) {
    cloudConflict = error.code === "CLOUD_CONFLICT";
    cloudMessage = `クラウド保存失敗: ${error.message}`;
    rerenderOpenMenu();
  }
}

function formatSyncTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function validRouteAfterSync(currentRoute) {
  if (currentRoute.name === "deckDetail" && !getDeck(currentRoute.deckId)) return { name: "decks" };
  if (currentRoute.name === "session" && !getSession(currentRoute.sessionId)) return { name: "sessions" };
  if (currentRoute.name === "storeDetail" && sessionsForStore(currentRoute.storeName).length === 0) return { name: "sessions", view: "stores" };
  return currentRoute;
}

function breakdownCard(label, record, rateValue) {
  return `
    <article class="breakdown-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(rateValue)}</strong>
      <small>${escapeHtml(record)}</small>
    </article>
  `;
}

function recordCompact(record) {
  const losses = "losses" in record ? record.losses : record.total - record.wins;
  const draws = record.draws || 0;
  return draws ? `${record.wins}-${losses}-${draws}` : `${record.wins}-${losses}`;
}

function turnRecordText(record) {
  return `${recordCompact(record)} / ${record.winRate}%`;
}

function sampleLabel(total) {
  if (total === 0) return "";
  if (total < 3) return "参考値";
  if (total >= 10) return "十分";
  return "蓄積中";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      if (registration.waiting && hadController) showUpdateBanner();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "activated" && hadController) showUpdateBanner();
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) showUpdateBanner();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
      registration.update().catch(() => {});
    } catch {
      // PWA support is optional; the app still works in a normal browser tab.
    }
  });
}

function showUpdateBanner() {
  if (updateBanner) updateBanner.hidden = false;
  phoneShell?.classList.add("update-available");
}

applyUpdateButton?.addEventListener("click", () => window.location.reload());

function cloudMenuMarkup() {
  const config = getCloudConfig();
  const statusText = cloudStatus.signedIn
    ? `ログイン中: ${cloudStatus.email}`
    : cloudStatus.configured
      ? "Supabase設定済み / 未ログイン"
      : "未設定";

  return `
    <div class="cloud-manager">
      <div class="cloud-head">
        <strong>クラウド同期</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
      ${cloudMessage ? `<p class="cloud-message">${escapeHtml(cloudMessage)}</p>` : ""}
      ${cloudStatus.configured ? "" : `
        <label>Supabase URL<input name="supabaseUrl" inputmode="url" placeholder="https://xxxx.supabase.co" value="${escapeHtml(config.url || "")}"></label>
        <label>Anon key<input name="supabaseAnonKey" placeholder="eyJ..." value="${escapeHtml(config.anonKey || "")}"></label>
        <button class="primary-button inline-action" type="button" data-save-cloud-config>Supabase設定を保存</button>
      `}
      ${cloudStatus.configured && !cloudStatus.signedIn ? `
        <label>メールアドレス<input name="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <button class="primary-button inline-action" type="button" data-cloud-login>ログイン用メールを送る</button>
        <details class="import-panel compact-help">
          <summary>Supabase設定を変更</summary>
          <label>Supabase URL<input name="supabaseUrl" inputmode="url" value="${escapeHtml(config.url || "")}"></label>
          <label>Anon key<input name="supabaseAnonKey" value="${escapeHtml(config.anonKey || "")}"></label>
          <button class="primary-button inline-action" type="button" data-save-cloud-config>Supabase設定を保存</button>
        </details>
      ` : ""}
      ${cloudStatus.signedIn ? `
        <div class="cloud-actions">
          ${pendingRemoteState ? `
            <div class="sync-conflict">
              <strong>同期する内容を選択</strong>
              <span>自動上書きを停止しています。</span>
              <div class="sync-compare">
                ${syncChoiceMarkup("この端末", pendingRemoteState.localSummary)}
                ${syncChoiceMarkup("クラウド", pendingRemoteState.remoteSummary)}
              </div>
            </div>
            <button class="primary-button inline-action" type="button" data-cloud-use-remote>クラウドの内容を使う</button>
            <button class="danger-button" type="button" data-cloud-force-upload>この端末の内容で上書き</button>
          ` : cloudConflict ? `
            <div class="sync-conflict">
              <strong>同期競合を検知</strong>
              <span>クラウドから読み込んで内容を確認してください。</span>
            </div>
            <button class="primary-button inline-action" type="button" data-cloud-download>クラウドとの差分を確認</button>
            <button class="danger-button" type="button" data-cloud-force-upload>この端末の内容で上書き</button>
          ` : `
            <button class="primary-button inline-action" type="button" data-cloud-download>クラウドから読込</button>
            <button class="primary-button inline-action ghost-action" type="button" data-cloud-upload>この端末をアップロード</button>
          `}
          <button class="danger-button" type="button" data-cloud-logout>ログアウト</button>
        </div>
      ` : ""}
    </div>
  `;
}

function syncChoiceMarkup(label, summary) {
  return `<div><strong>${label}</strong><span>${summary.decks}デッキ</span><span>${summary.sessions}大会</span><span>${summary.matches}試合</span></div>`;
}

function menuRowsMarkup() {
  const pageRow = route.name === "deckDetail"
    ? `<button type="button" data-open-menu-panel="deckSettings"><span>デッキ設定</span><small>名前・バージョン・アーカイブ</small><b>›</b></button>`
    : route.name === "session"
      ? `<button type="button" data-open-menu-panel="sessionSettings"><span>セッション設定</span><small>セッションの削除</small><b>›</b></button>`
      : "";
  const cloudText = cloudStatus.signedIn ? "ログイン中・同期設定" : cloudStatus.configured ? "未ログイン" : "未設定";
  return `
    ${pageRow}
    <button type="button" data-open-guide><span>使い方</span><small>初回設定・大会中の記録・データ保護</small><b>›</b></button>
    <button type="button" data-open-menu-panel="cloudSettings"><span>クラウド同期</span><small>${escapeHtml(cloudText)}</small><b>›</b></button>
    <button type="button" data-open-menu-panel="dataSettings"><span>環境・データ管理</span><small>環境、名称、バックアップ</small><b>›</b></button>
  `;
}

function dataSettingsMarkup() {
  return `
    <div class="environment-manager">
      <strong>環境管理</strong>
      <div class="environment-chip-list">${environmentOptions().map((environment) => `<span>${escapeHtml(environment)}</span>`).join("") || "<span>未登録</span>"}</div>
      <label>環境を追加<input name="newEnvironment" list="environmentSuggestions" placeholder="例: 第4弾環境"></label>
      <button class="primary-button inline-action" type="button" data-add-environment>環境を追加</button>
    </div>
    <details class="import-panel">
      <summary>相手デッキ名を統合</summary>
      <input type="hidden" name="mergeType" value="opponentDeck">
      <label>統合元<input name="mergeFrom" placeholder="表記揺れしている名称"></label>
      <label>統合先<input name="mergeTo" placeholder="今後使う正式名称"></label>
      <button class="primary-button inline-action" type="button" data-merge-names>名称を統合</button>
    </details>
    <button class="primary-button inline-action ghost-action" type="button" data-copy-export>JSONをコピー</button>
    <details class="import-panel">
      <summary>JSONから復元</summary>
      <label>JSONデータ<textarea name="importJson" rows="5" placeholder="PCでコピーしたJSONを貼り付け"></textarea></label>
      <button class="primary-button inline-action" type="button" data-import-json>インポート</button>
    </details>
  `;
}

function routeActionMarkup() {
  if (route.name === "deckDetail") {
    const deck = getDeck(route.deckId);
    if (!deck) return "";
    const sessionCount = sessionsForDeck(deck.id).length;
    const matchCount = matchesForDeck(deck.id).length;
    return `
      <div class="environment-manager">
        <strong>デッキ設定</strong>
        <label>デッキ名<input name="deckName" value="${escapeHtml(deck.name)}"></label>
        <label>現行バージョン<input name="deckVersion" value="${escapeHtml(deck.version || "v1")}" placeholder="例: v2 / 新弾後"></label>
        <button class="primary-button inline-action" type="button" data-update-deck="${deck.id}">デッキ設定を更新</button>
        <button class="primary-button inline-action ghost-action" type="button" data-toggle-deck-archive="${deck.id}">${deck.archived ? "使用中に戻す" : "アーカイブする"}</button>
      </div>
      <div class="danger-zone">
        <strong>このデッキ</strong>
        <span>${sessionCount}セッション / ${matchCount}試合が紐づいています。</span>
        <button class="danger-button" type="button" data-delete-current-deck="${deck.id}">デッキを削除</button>
      </div>
    `;
  }

  if (route.name === "session") {
    const session = getSession(route.sessionId);
    if (!session) return "";
    const matchCount = matchesForSession(session.id).length;
    return `
      <div class="danger-zone">
        <strong>このセッション</strong>
        <span>${matchCount}試合が紐づいています。</span>
        <button class="danger-button" type="button" data-delete-current-session="${session.id}">セッションを削除</button>
      </div>
    `;
  }

  return "";
}
