import {
  getCrossBreakdown,
  getPlayerBreakdown,
  getPlayerRecord,
  getRpsBreakdown,
  summarizeDecks,
  summarizeMatches
} from "./analytics.js";
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

const view = document.querySelector("#appView");
const title = document.querySelector("#screenTitle");
const backButton = document.querySelector("#backButton");
const fabButton = document.querySelector("#fabButton");
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
let route = { name: "decks" };
let dialogMode = null;
let editingMatchId = null;
let editingSessionId = null;
let cloudStatus = cloudSnapshot("local");
let cloudMessage = "";
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSavePending = false;
let suppressCloudSave = false;
let cloudUpdatedAt = null;
let cloudConflict = false;

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

  return {
    decks: [
      { id: "deck-takagi", name: "高木婚活", version: "v1", color: "purple" },
      { id: "deck-conan", name: "赤青コナン", version: "v1", color: "blue" }
    ],
    sessions: [
      { id: "session-1", deckId: "deck-takagi", deckVersion: "v1", name: "秋葉原チェルモ", date: "2026-05-30", format: "BO1", environment: "現環境" },
      { id: "session-2", deckId: "deck-takagi", deckVersion: "v1", name: "カードマウンテン", date: "2026-05-29", format: "BO1", environment: "現環境" }
    ],
    environments: ["現環境"],
    matches: [
      makeMatch("session-1", "高木婚活", "婚活警視庁", "佐藤さん", "win", "first", "rock", "none", "none"),
      makeMatch("session-1", "高木婚活", "婚活長野", "伊達さん", "win", "first", "scissors", "none", "none"),
      makeMatch("session-1", "高木婚活", "白黄王冠", "田中さん", "win", "second", "paper", "none", "pass1"),
      makeMatch("session-1", "高木婚活", "白黄王冠", "田中さん", "win", "first", "rock", "none", "none"),
      makeMatch("session-1", "高木婚活", "疾風警視庁", "鈴木さん", "loss", "first", "scissors", "pass1", "none"),
      makeMatch("session-2", "高木婚活", "緑服部", "佐藤さん", "win", "second", "rock", "none", "none"),
      makeMatch("session-2", "高木婚活", "青蘭", "山本さん", "win", "second", "paper", "none", "none")
    ]
  };
}

function normalizeState(rawState) {
  const decks = (rawState.decks || []).map((deck) => ({
    ...deck,
    version: deck.version || "v1"
  }));
  const deckVersions = new Map(decks.map((deck) => [deck.id, deck.version]));
  const sessionEnvironments = (rawState.sessions || []).map((session) => session.environment || "未設定");
  return {
    decks,
    sessions: (rawState.sessions || []).map((session) => ({
      ...session,
      environment: session.environment || "未設定",
      deckVersion: session.deckVersion || deckVersions.get(session.deckId) || "v1"
    })),
    environments: uniqueValues([...(rawState.environments || []), ...sessionEnvironments]),
    matches: rawState.matches || []
  };
}

function migrateLegacyMatches(matches) {
  const decks = [...new Set(matches.map((match) => match.myDeck || "未設定"))].map((name) => ({
    id: crypto.randomUUID(),
    name,
    version: "v1",
    color: "purple"
  }));
  const sessions = decks.map((deck) => ({
    id: crypto.randomUUID(),
    deckId: deck.id,
    deckVersion: deck.version,
    name: "移行データ",
    date: new Date().toISOString().slice(0, 10),
    format: "BO1",
    environment: "未設定"
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
        opponentPlayer: "未登録",
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
  if (!suppressCloudSave) scheduleCloudSave();
}

function scheduleCloudSave() {
  if (!cloudStatus.signedIn || cloudConflict) return;
  window.clearTimeout(cloudSaveTimer);
  cloudMessage = "クラウド保存待ち";
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
  try {
    cloudUpdatedAt = await saveCloudState(snapshot, { expectedUpdatedAt: cloudUpdatedAt });
    cloudConflict = false;
    cloudMessage = "クラウド保存済み";
    rerenderOpenMenu();
  } catch (error) {
    cloudConflict = error.code === "CLOUD_CONFLICT";
    cloudMessage = `クラウド保存失敗: ${error.message}`;
    rerenderOpenMenu();
  } finally {
    cloudSaveInFlight = false;
    if (cloudSavePending) scheduleCloudSave();
  }
}

function rerenderOpenMenu() {
  if (dialog.open && dialogMode === "menu") openDialog("menu");
}

function updateSuggestions() {
  suggestionLists.opponentDecks.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentDeck)));
  suggestionLists.players.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentPlayer).filter((name) => name !== "未登録")));
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
  const sessions = sessionsForDeck(deckId).filter((session) => (
    (!environment || session.environment === environment)
    && (!store || session.name === store)
    && (!deckVersion || session.deckVersion === deckVersion)
  ));
  const ids = new Set(sessions.map((session) => session.id));
  return enrichMatches(state.matches.filter((match) => ids.has(match.sessionId)));
}

function storesForDeck(deckId, environment = "", deckVersion = "") {
  return uniqueValues(
    sessionsForDeck(deckId)
      .filter((session) => !environment || session.environment === environment)
      .filter((session) => !deckVersion || session.deckVersion === deckVersion)
      .map((session) => session.name)
  );
}

function versionsForDeck(deckId) {
  return uniqueValues(sessionsForDeck(deckId).map((session) => session.deckVersion || "v1"));
}

function applyPeriod(matches, period) {
  const limit = Number(period);
  if (!limit) return matches;
  return [...matches]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order)
    .slice(-limit);
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
    sessionsForDeck(deckId)
      .filter((session) => !deckVersion || session.deckVersion === deckVersion)
      .map((session) => session.environment || "未設定")
  );
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
  if (!value) return "日付未設定";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function summaryCard(summary, meta) {
  const winRate = summary.winRate || 0;
  return `
    <article class="summary-card">
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

function renderDecks() {
  title.textContent = "デッキ選択";
  const decks = summarizeDecks(state.decks, state.sessions, state.matches);
  const overall = summarizeMatches(state.matches);

  view.innerHTML = `
    ${summaryCard(overall, [`▣ ${state.decks.length}デッキ`, `□ ${state.sessions.length}セッション`, `⚔ ${state.matches.length}試合`])}
    <h2 class="section-title">デッキ</h2>
    <div class="list-stack">
      ${decks.map((deck) => `
        <button class="list-card" type="button" data-open-deck="${deck.id}">
          <span class="badge">▣</span>
          <span>
            <strong class="list-title">${escapeHtml(deck.name)}</strong>
            <span class="list-meta"><span>${escapeHtml(getDeck(deck.id)?.version || "v1")}</span><span>□ ${deck.sessions}セッション</span><span>⚔ ${deck.total}試合</span></span>
          </span>
          <span class="score-pill ${recordToneClass(deck)}">${deck.wins}-${deck.losses}</span>
        </button>
      `).join("") || `<div class="empty-card">＋ からデッキを登録しましょう</div>`}
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
    ${summaryCard(summary, [`□ ${deckSessions.length}セッション`, `⚔ ${summary.total}試合`])}
    <div class="list-stack">
      ${deckSessions.map((session) => {
        const count = matchesForSession(session.id).length;
        const summary = sessionSummary(session.id);
        return `
          <button class="list-card" type="button" data-open-session="${session.id}">
            <span class="badge">1</span>
            <span>
              <strong class="list-title">${escapeHtml(session.name)}</strong>
              <span class="list-meta"><span>${escapeHtml(session.deckVersion || "v1")}</span><span>□ ${formatDate(session.date)}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>⚔ ${count}試合</span></span>
            </span>
            <span class="score-pill ${recordToneClass(summary)}">${sessionRecord(session.id)}</span>
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
    ${summaryCard(summary, [`${escapeHtml(session.deckVersion || "v1")}`, `□ ${formatDate(session.date)}`, `${escapeHtml(session.environment || "未設定")}`, `⚔ ${rounds.length}試合`, `${escapeHtml(session.format || "BO1")}`])}
    <button class="session-edit-button" type="button" data-edit-session="${session.id}">セッション編集</button>
    <h2 class="section-title">ラウンド</h2>
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
              <span>相手: ${escapeHtml(match.opponentPlayer || "未登録")}</span>
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
  const selectedDeckId = route.deckId || state.decks[0]?.id;
  const deck = getDeck(selectedDeckId);
  const versions = selectedDeckId ? versionsForDeck(selectedDeckId) : [];
  const selectedVersion = route.version && versions.includes(route.version) ? route.version : "";
  const environments = selectedDeckId ? environmentsForDeck(selectedDeckId, selectedVersion) : [];
  const selectedEnvironment = route.environment && environments.includes(route.environment) ? route.environment : "";
  const stores = selectedDeckId ? storesForDeck(selectedDeckId, selectedEnvironment, selectedVersion) : [];
  const selectedStore = route.store && stores.includes(route.store) ? route.store : "";
  const selectedPeriod = ["all", "10", "20", "30"].includes(route.period) ? route.period : "all";
  const selectedPivot = ["opponentDeck", "deckVersion", "environment", "store", "opponentPlayer"].includes(route.pivot) ? route.pivot : "opponentDeck";
  const selectedSort = ["total", "low", "high"].includes(route.sort) ? route.sort : "total";
  const baseMatches = selectedDeckId ? analysisMatchesForDeck(selectedDeckId, selectedEnvironment, selectedStore, selectedVersion) : enrichMatches(state.matches);
  const matches = applyPeriod(baseMatches, selectedPeriod);
  const summary = summarizeMatches(matches);
  const passRecord = splitPassRecord(matches);
  const rows = sortCrossRows(getCrossBreakdown(matches, selectedPivot), selectedSort);

  view.innerHTML = `
    <div class="deck-tabs" aria-label="分析するデッキ">
      ${state.decks.map((item) => `
        <button class="${item.id === selectedDeckId ? "active" : ""}" type="button" data-analysis-deck="${item.id}">${escapeHtml(item.name)}</button>
      `).join("")}
    </div>
    <div class="deck-tabs filter-tabs" aria-label="分析するデッキバージョン">
      <button class="${selectedVersion === "" ? "active" : ""}" type="button" data-analysis-version="">全バージョン</button>
      ${versions.map((version) => `
        <button class="${version === selectedVersion ? "active" : ""}" type="button" data-analysis-version="${escapeHtml(version)}">${escapeHtml(version)}</button>
      `).join("")}
    </div>
    <div class="deck-tabs environment-tabs" aria-label="分析する環境">
      <button class="${selectedEnvironment === "" ? "active" : ""}" type="button" data-analysis-environment="">全環境</button>
      ${environments.map((environment) => `
        <button class="${environment === selectedEnvironment ? "active" : ""}" type="button" data-analysis-environment="${escapeHtml(environment)}">${escapeHtml(environment)}</button>
      `).join("")}
    </div>
    <div class="deck-tabs filter-tabs" aria-label="分析する店舗">
      <button class="${selectedStore === "" ? "active" : ""}" type="button" data-analysis-store="">全店舗</button>
      ${stores.map((store) => `
        <button class="${store === selectedStore ? "active" : ""}" type="button" data-analysis-store="${escapeHtml(store)}">${escapeHtml(store)}</button>
      `).join("")}
    </div>
    <div class="deck-tabs filter-tabs" aria-label="分析する期間">
      ${[["all", "全期間"], ["10", "直近10戦"], ["20", "直近20戦"], ["30", "直近30戦"]].map(([value, label]) => `
        <button class="${value === selectedPeriod ? "active" : ""}" type="button" data-analysis-period="${value}">${label}</button>
      `).join("")}
    </div>

    <section class="analysis-hero">
      <div>
        <span class="label">${escapeHtml(deck?.name || "全体")}${selectedVersion ? ` / ${escapeHtml(selectedVersion)}` : ""}${selectedEnvironment ? ` / ${escapeHtml(selectedEnvironment)}` : ""}${selectedStore ? ` / ${escapeHtml(selectedStore)}` : ""}</span>
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
          </div>
        </details>
      `).join("") || `<div class="empty-card">この条件に合う試合記録がありません</div>`}
    </div>
  `;
}

function renderPlayers() {
  title.textContent = "プレイヤー";
  const selected = route.playerName;
  const rows = getPlayerBreakdown(state.matches).filter((row) => row.name !== "未登録");

  if (selected) {
    const record = getPlayerRecord(selected, state.matches);
    const rpsRows = getRpsBreakdown(record.matches);
    view.innerHTML = `
      ${summaryCard(record, [`⚔ ${record.total}試合`, `${record.wins}勝 ${record.losses}敗 ${record.draws}分`])}
      <h2 class="section-title">じゃんけん傾向</h2>
      <section class="rps-card compact">
        <div class="rps-stack" aria-label="相手のじゃんけん傾向">
          ${rpsRows.map((row) => `<span class="rps-segment ${row.key}" style="width:${row.percentage}%" title="${row.label} ${row.percentage}%"></span>`).join("")}
        </div>
        <div class="rps-legend">
          ${rpsRows.map((row) => `<span><i class="${row.key}"></i>${row.label} ${row.percentage}%</span>`).join("")}
        </div>
      </section>
      <h2 class="section-title">${escapeHtml(selected)} さんとの履歴</h2>
      <div class="list-stack">
        ${record.matches.map((match) => {
          const session = getSession(match.sessionId);
          return `
            <button class="round-card player-match-card" type="button" data-edit-match="${match.id}">
              <span class="result-pill ${match.result}">${resultLabels[match.result]}</span>
              <span>
                <strong class="round-title">${escapeHtml(match.myDeck)} vs ${escapeHtml(match.opponentDeck)}</strong>
                <span class="round-meta"><span>${formatDate(session?.date)}</span><span>${escapeHtml(session?.name || "")}</span><span>${firstLabels[match.firstPlayer]}</span><span>相手${rpsLabels[match.opponentRps]}</span></span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  view.innerHTML = `
    <h2 class="section-title">相手プレイヤー別</h2>
    <div class="list-stack">
      ${rows.map((row) => `
        <button class="list-card" type="button" data-open-player="${escapeHtml(row.name)}">
          <span class="badge">人</span>
          <span>
            <strong class="list-title">${escapeHtml(row.name)}</strong>
            <span class="list-meta"><span>${row.wins}勝 ${row.losses}敗 ${row.draws}分</span><span>${row.total}戦</span></span>
          </span>
          <span class="score-pill">${row.winRate}%</span>
        </button>
      `).join("") || `<div class="empty-card">試合記録に相手プレイヤー名を入れると、ここに履歴が出ます</div>`}
    </div>
  `;
}

function renderSessions() {
  title.textContent = "セッション";
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  view.innerHTML = `
    <div class="list-stack">
      ${sessions.map((session) => {
        const deck = getDeck(session.deckId);
        const summary = sessionSummary(session.id);
        return `
          <button class="list-card" type="button" data-open-session="${session.id}">
            <span class="badge">□</span>
            <span>
              <strong class="list-title">${escapeHtml(session.name)}</strong>
              <span class="list-meta"><span>${escapeHtml(deck?.name || "未設定")}</span><span>${escapeHtml(session.deckVersion || "v1")}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${formatDate(session.date)}</span></span>
            </span>
            <span class="score-pill ${recordToneClass(summary)}">${sessionRecord(session.id)}</span>
          </button>
        `;
      }).join("") || `<div class="empty-card">＋ からセッションを登録しましょう</div>`}
    </div>
  `;
}

function render() {
  updateSuggestions();
  backButton.style.visibility = ["deckDetail", "session", "playerDetail"].includes(route.name) ? "visible" : "hidden";
  fabButton.hidden = route.name === "summary" || route.name === "players" || route.name === "playerDetail";
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.nav === rootNavName()));

  if (route.name === "decks") renderDecks();
  if (route.name === "deckDetail") renderDeckDetail(route.deckId);
  if (route.name === "session") renderSession(route.sessionId);
  if (route.name === "summary") renderSummary();
  if (route.name === "players" || route.name === "playerDetail") renderPlayers();
  if (route.name === "sessions") renderSessions();
}

function rootNavName() {
  if (route.name === "deckDetail") return "decks";
  if (route.name === "session") return "sessions";
  if (route.name === "playerDetail") return "players";
  return route.name;
}

function analysisRoute(overrides = {}) {
  return {
    name: "summary",
    deckId: route.deckId || state.decks[0]?.id,
    version: route.version || "",
    environment: route.environment || "",
    store: route.store || "",
    period: route.period || "all",
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

  if (mode === "menu") {
    const pageAction = routeActionMarkup();
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "データメニュー";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `
      ${pageAction}
      ${cloudMenuMarkup()}
      <div class="menu-note">
        <strong>自動保存中</strong>
        <span>入力した内容はこの端末のブラウザに保存されています。</span>
      </div>
      <div class="environment-manager">
        <strong>環境管理</strong>
        <div class="environment-chip-list">
          ${environmentOptions().map((environment) => `<span>${escapeHtml(environment)}</span>`).join("") || "<span>未登録</span>"}
        </div>
        <label>環境を追加<input name="newEnvironment" list="environmentSuggestions" placeholder="例: 第4弾環境"></label>
        <button class="primary-button inline-action" type="button" data-add-environment>環境を追加</button>
      </div>
      <details class="import-panel">
        <summary>名称を統合</summary>
        <label>対象<select name="mergeType">
          <option value="opponentDeck">相手デッキ</option>
          <option value="opponentPlayer">プレイヤー</option>
        </select></label>
        <label>統合元<input name="mergeFrom" placeholder="表記揺れしている名称"></label>
        <label>統合先<input name="mergeTo" placeholder="今後使う正式名称"></label>
        <button class="primary-button inline-action" type="button" data-merge-names>名称を統合</button>
      </details>
      <button class="primary-button inline-action" type="button" data-copy-export>JSONをコピー</button>
      <details class="import-panel">
        <summary>JSONから復元</summary>
        <label>JSONデータ<textarea name="importJson" rows="5" placeholder="PCでコピーしたJSONを貼り付け"></textarea></label>
        <button class="primary-button inline-action" type="button" data-import-json>インポート</button>
      </details>
    `;
  }

  if (mode === "session") {
    dialogSubmit.hidden = false;
    dialogKicker.textContent = "Session";
    const editingSession = editingSessionId ? getSession(editingSessionId) : null;
    dialogTitle.textContent = editingSession ? "セッション編集" : "セッション登録";
    dialogSubmit.textContent = editingSession ? "更新" : "保存";
    const deckId = route.deckId || state.decks[0]?.id || "";
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
        <label>使用デッキ<select name="deckId" required>${state.decks.map((deck) => `<option value="${deck.id}" ${deck.id === deckId ? "selected" : ""}>${escapeHtml(deck.name)}</option>`).join("")}</select></label>
      `}
      <label>大会名/店舗名<input name="name" list="sessionNameSuggestions" required placeholder="例: 秋葉原チェルモ" value="${escapeHtml(editingSession?.name || "")}"></label>
      <label>環境<input name="environment" list="environmentSuggestions" required placeholder="例: 第3弾環境" value="${escapeHtml(editingSession?.environment || preferredEnvironment())}"></label>
      <div class="inline-fields">
        <label>日付<input type="date" name="date" required value="${editingSession?.date || new Date().toISOString().slice(0, 10)}"></label>
        <label>形式<select name="format">${optionTags([["BO1", "BO1"], ["BO3", "BO3"]], editingSession?.format || "BO1")}</select></label>
      </div>
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
      <label>相手プレイヤーネーム（任意）<input name="opponentPlayer" list="playerSuggestions" placeholder="例: 佐藤さん" value="${escapeHtml(editingMatch?.opponentPlayer === "未登録" ? "" : editingMatch?.opponentPlayer || "")}"></label>
      <div class="inline-fields">
        <label>勝敗<select name="result" required>${requiredOptionTags([["win", "Win"], ["loss", "Lose"], ["draw", "Draw"]], editingMatch?.result || "", "選択")}</select></label>
        <label>先/後<select name="firstPlayer" required>${requiredOptionTags([["first", "先攻"], ["second", "後攻"]], editingMatch?.firstPlayer || "", "選択")}</select></label>
      </div>
      <label>じゃんけんで相手の出した手<select name="opponentRps">${optionTags([["unknown", "未記録"], ["rock", "グー"], ["scissors", "チョキ"], ["paper", "パー"]], editingMatch?.opponentRps || "unknown")}</select></label>
      <div class="inline-fields">
        <label>自分のパス<select name="myPassed">${passOptions(editingMatch?.myPassed || "none")}</select></label>
        <label>相手のパス<select name="opponentPassed">${passOptions(editingMatch?.opponentPassed || "none")}</select></label>
      </div>
      <label>メモ<textarea name="memo" rows="3" placeholder="印象的だった展開、敗因など">${escapeHtml(editingMatch?.memo || "")}</textarea></label>
      ${editingMatch ? `<button class="danger-button" type="button" data-delete-editing-match>この試合を削除</button>` : ""}
    `;
  }

  if (!dialog.open) dialog.showModal();
}

entryForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const data = new FormData(entryForm);

  if (dialogMode === "deck") {
    const deck = {
      id: crypto.randomUUID(),
      name: data.get("name").trim(),
      version: data.get("version").trim() || "v1",
      color: "purple"
    };
    state.decks.push(deck);
    route = { name: "deckDetail", deckId: deck.id };
  }

  if (dialogMode === "session") {
    const selectedDeck = getDeck(data.get("deckId"));
    const currentSession = editingSessionId ? getSession(editingSessionId) : null;
    const session = {
      id: editingSessionId || crypto.randomUUID(),
      deckId: data.get("deckId"),
      deckVersion: currentSession?.deckVersion || selectedDeck?.version || "v1",
      name: data.get("name").trim(),
      date: data.get("date"),
      format: data.get("format"),
      environment: data.get("environment").trim()
    };
    addEnvironment(session.environment);
    if (editingSessionId) {
      state.sessions = state.sessions.map((current) => (current.id === editingSessionId ? session : current));
    } else {
      state.sessions.push(session);
    }
    route = { name: "session", sessionId: session.id };
  }

  if (dialogMode === "match") {
    const nextMatch = {
      id: crypto.randomUUID(),
      sessionId: route.sessionId,
      myDeck: data.get("myDeck").trim(),
      opponentDeck: data.get("opponentDeck").trim(),
      opponentPlayer: data.get("opponentPlayer").trim() || "未登録",
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
  const analysisDeckButton = event.target.closest("[data-analysis-deck]");
  const analysisEnvironmentButton = event.target.closest("[data-analysis-environment]");
  const analysisVersionButton = event.target.closest("[data-analysis-version]");
  const analysisStoreButton = event.target.closest("[data-analysis-store]");
  const analysisPeriodButton = event.target.closest("[data-analysis-period]");
  const analysisPivotButton = event.target.closest("[data-analysis-pivot]");
  if (deckButton) setRoute({ name: "deckDetail", deckId: deckButton.dataset.openDeck });
  if (sessionButton) setRoute({ name: "session", sessionId: sessionButton.dataset.openSession });
  if (playerButton) setRoute({ name: "playerDetail", playerName: playerButton.dataset.openPlayer });
  if (editButton) openDialog("match", editButton.dataset.editMatch);
  if (editSessionButton) openDialog("session", editSessionButton.dataset.editSession);
  if (analysisDeckButton) setRoute(analysisRoute({ deckId: analysisDeckButton.dataset.analysisDeck, version: "", environment: "", store: "" }));
  if (analysisVersionButton) setRoute(analysisRoute({ version: analysisVersionButton.dataset.analysisVersion, store: "" }));
  if (analysisEnvironmentButton) setRoute(analysisRoute({ environment: analysisEnvironmentButton.dataset.analysisEnvironment, store: "" }));
  if (analysisStoreButton) setRoute(analysisRoute({ store: analysisStoreButton.dataset.analysisStore }));
  if (analysisPeriodButton) setRoute(analysisRoute({ period: analysisPeriodButton.dataset.analysisPeriod }));
  if (analysisPivotButton) setRoute(analysisRoute({ pivot: analysisPivotButton.dataset.analysisPivot }));
});

view.addEventListener("change", (event) => {
  const sortSelect = event.target.closest("[data-analysis-sort]");
  if (sortSelect) setRoute(analysisRoute({ sort: sortSelect.value }));
});

dialogFields.addEventListener("click", (event) => {
  if (event.target.closest("[data-save-cloud-config]")) {
    const url = dialogFields.querySelector("input[name='supabaseUrl']").value;
    const anonKey = dialogFields.querySelector("input[name='supabaseAnonKey']").value;
    if (!url.trim() || !anonKey.trim()) {
      cloudMessage = "Supabase URLとAnon keyを入力してください";
      openDialog("menu");
      return;
    }
    saveCloudConfig(url, anonKey);
    cloudMessage = "Supabase設定を保存しました";
    refreshCloudSession();
    openDialog("menu");
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
        openDialog("menu");
      })
      .catch((error) => {
        cloudMessage = `ログイン失敗: ${error.message}`;
        openDialog("menu");
      });
    return;
  }

  if (event.target.closest("[data-cloud-download]")) {
    pullCloudState();
    return;
  }

  if (event.target.closest("[data-cloud-upload]")) {
    pushCloudState();
    return;
  }

  if (event.target.closest("[data-cloud-force-upload]")) {
    const confirmed = confirm("クラウド上の新しい変更を、この端末のデータで上書きしますか？");
    if (confirmed) pushCloudState({ force: true });
    return;
  }

  if (event.target.closest("[data-cloud-logout]")) {
    signOutCloud()
      .then((nextStatus) => {
        cloudStatus = nextStatus;
        cloudUpdatedAt = null;
        cloudConflict = false;
        cloudMessage = "ログアウトしました";
        openDialog("menu");
      })
      .catch((error) => {
        cloudMessage = `ログアウト失敗: ${error.message}`;
        openDialog("menu");
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
    openDialog("menu");
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
    openDialog("menu");
    return;
  }

  if (event.target.closest("[data-merge-names]")) {
    const field = dialogFields.querySelector("select[name='mergeType']").value;
    const from = dialogFields.querySelector("input[name='mergeFrom']").value.trim();
    const to = dialogFields.querySelector("input[name='mergeTo']").value.trim();
    if (!from || !to || from === to) return;
    const affected = state.matches.filter((match) => String(match[field] || "").trim() === from).length;
    state.matches = state.matches.map((match) => (
      String(match[field] || "").trim() === from ? { ...match, [field]: to } : match
    ));
    saveState();
    cloudMessage = `${affected}試合の名称を「${to}」へ統合しました`;
    openDialog("menu");
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
  if (route.name === "deckDetail") setRoute({ name: "decks" });
  if (route.name === "session") {
    const session = getSession(route.sessionId);
    setRoute(session ? { name: "deckDetail", deckId: session.deckId } : { name: "sessions" });
  }
  if (route.name === "playerDetail") setRoute({ name: "players" });
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => setRoute({ name: button.dataset.nav }));
});

document.querySelector("#moreButton").addEventListener("click", () => {
  openDialog("menu");
});

saveState();
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
  return environmentOptions()[0] || "現環境";
}

function addEnvironment(environment) {
  state.environments = uniqueValues([...(state.environments || []), environment]);
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
      suppressCloudSave = true;
      state = normalizeState(remote.data);
      localStorage.setItem(storageKey, JSON.stringify(state));
      suppressCloudSave = false;
      cloudUpdatedAt = remote.updated_at;
      cloudConflict = false;
      cloudMessage = `クラウドから読込済み ${formatSyncTime(remote.updated_at)}`;
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
    suppressCloudSave = false;
    cloudMessage = `クラウド読込失敗: ${error.message}`;
    rerenderOpenMenu();
  }
}

async function pushCloudState(options = {}) {
  const { silent = false, force = false } = options;
  try {
    if (!silent) {
      cloudMessage = "クラウド保存中";
      rerenderOpenMenu();
    }
    const updatedAt = await saveCloudState(state, {
      expectedUpdatedAt: cloudUpdatedAt,
      force
    });
    cloudUpdatedAt = updatedAt;
    cloudConflict = false;
    cloudMessage = `クラウド保存済み ${formatSyncTime(updatedAt)}`;
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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // PWA support is optional; the app still works in a normal browser tab.
    });
  });
}

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
          ${cloudConflict ? `
            <div class="sync-conflict">
              <strong>同期競合を検知</strong>
              <span>別端末の更新を保護するため、自動保存を停止しました。</span>
            </div>
          ` : ""}
          <button class="primary-button inline-action" type="button" data-cloud-download>クラウドから読込</button>
          ${cloudConflict
            ? `<button class="danger-button" type="button" data-cloud-force-upload>この端末の内容で上書き</button>`
            : `<button class="primary-button inline-action ghost-action" type="button" data-cloud-upload>この端末をアップロード</button>`}
          <button class="danger-button" type="button" data-cloud-logout>ログアウト</button>
        </div>
      ` : ""}
    </div>
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
