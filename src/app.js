import {
  getAnalysisInsights,
  getOpponentTurnBreakdown,
  getPlayerBreakdown,
  getPlayerRecord,
  getRpsBreakdown,
  summarizeDecks,
  summarizeMatches
} from "./analytics.js";

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
      { id: "deck-takagi", name: "高木婚活", color: "purple" },
      { id: "deck-conan", name: "赤青コナン", color: "blue" }
    ],
    sessions: [
      { id: "session-1", deckId: "deck-takagi", name: "秋葉原チェルモ", date: "2026-05-30", format: "BO1", environment: "現環境" },
      { id: "session-2", deckId: "deck-takagi", name: "カードマウンテン", date: "2026-05-29", format: "BO1", environment: "現環境" }
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
  const sessionEnvironments = (rawState.sessions || []).map((session) => session.environment || "未設定");
  return {
    decks: rawState.decks || [],
    sessions: (rawState.sessions || []).map((session) => ({
      ...session,
      environment: session.environment || "未設定"
    })),
    environments: uniqueValues([...(rawState.environments || []), ...sessionEnvironments]),
    matches: rawState.matches || []
  };
}

function migrateLegacyMatches(matches) {
  const decks = [...new Set(matches.map((match) => match.myDeck || "未設定"))].map((name) => ({
    id: crypto.randomUUID(),
    name,
    color: "purple"
  }));
  const sessions = decks.map((deck) => ({
    id: crypto.randomUUID(),
    deckId: deck.id,
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
}

function updateSuggestions() {
  suggestionLists.opponentDecks.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentDeck)));
  suggestionLists.players.innerHTML = optionList(uniqueValues(state.matches.map((match) => match.opponentPlayer)));
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

function environmentsForDeck(deckId) {
  return uniqueValues(sessionsForDeck(deckId).map((session) => session.environment || "未設定"));
}

function sessionRecord(sessionId) {
  const summary = summarizeMatches(matchesForSession(sessionId));
  return `${summary.wins}-${summary.losses}${summary.draws ? `-${summary.draws}` : ""}`;
}

function recordText(summary) {
  return `${summary.wins}-${summary.losses}-${summary.draws || 0}`;
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
            <span class="list-meta"><span>□ ${deck.sessions}セッション</span><span>⚔ ${deck.total}試合</span></span>
          </span>
          <span class="score-pill">${deck.wins}-${deck.losses}</span>
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
        return `
          <button class="list-card" type="button" data-open-session="${session.id}">
            <span class="badge">1</span>
            <span>
              <strong class="list-title">${escapeHtml(session.name)}</strong>
              <span class="list-meta"><span>□ ${formatDate(session.date)}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>⚔ ${count}試合</span></span>
            </span>
            <span class="score-pill">${sessionRecord(session.id)}</span>
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
    ${summaryCard(summary, [`□ ${formatDate(session.date)}`, `${escapeHtml(session.environment || "未設定")}`, `⚔ ${rounds.length}試合`, `${escapeHtml(session.format || "BO1")}`])}
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
  const environments = selectedDeckId ? environmentsForDeck(selectedDeckId) : [];
  const selectedEnvironment = route.environment && environments.includes(route.environment) ? route.environment : "";
  const matches = selectedDeckId ? matchesForDeckInEnvironment(selectedDeckId, selectedEnvironment) : state.matches;
  const summary = summarizeMatches(matches);
  const opponentRows = getOpponentTurnBreakdown(matches);
  const insights = getAnalysisInsights(matches);
  const passGap = Math.round((insights.passRecord.noPass.winRate - insights.passRecord.anyPass.winRate) * 10) / 10;

  view.innerHTML = `
    <div class="deck-tabs" aria-label="分析するデッキ">
      ${state.decks.map((item) => `
        <button class="${item.id === selectedDeckId ? "active" : ""}" type="button" data-analysis-deck="${item.id}">${escapeHtml(item.name)}</button>
      `).join("")}
    </div>
    <div class="deck-tabs environment-tabs" aria-label="分析する環境">
      <button class="${selectedEnvironment === "" ? "active" : ""}" type="button" data-analysis-environment="">全環境</button>
      ${environments.map((environment) => `
        <button class="${environment === selectedEnvironment ? "active" : ""}" type="button" data-analysis-environment="${escapeHtml(environment)}">${escapeHtml(environment)}</button>
      `).join("")}
    </div>

    <section class="analysis-hero">
      <div>
        <span class="label">${escapeHtml(deck?.name || "全体")}${selectedEnvironment ? ` / ${escapeHtml(selectedEnvironment)}` : ""}</span>
        <strong>${summary.winRate}%</strong>
        <small>${summary.wins}勝 ${summary.losses}敗 ${summary.draws || 0}分 / ${summary.total}戦</small>
      </div>
      <div class="mini-metrics">
        <span>先 ${summary.first.winRate}%</span>
        <span>後 ${summary.second.winRate}%</span>
      </div>
    </section>

    <section class="focus-panel">
      <h2>次に見るところ</h2>
      <div class="focus-grid">
        ${focusCard("苦手対面", insights.worstMatchup ? `${insights.worstMatchup.name} ${insights.worstMatchup.winRate}%` : "記録待ち", insights.worstMatchup ? `${insights.worstMatchup.wins}-${insights.worstMatchup.losses} / ${insights.worstMatchup.total}戦` : "相手デッキを記録すると表示")}
        ${focusCard("先後差", `${turnLabel(insights.turnGap.stronger)}+${insights.turnGap.gap}%`, `${turnLabel(insights.turnGap.weaker)}時のプランを確認`)}
        ${focusCard("パス影響", `${passGap >= 0 ? "+" : ""}${passGap}%`, `パス無 ${insights.passRecord.noPass.winRate}% / パス有 ${insights.passRecord.anyPass.winRate}%`)}
      </div>
    </section>

    <h2 class="section-title tight-title">相手デッキ別</h2>
    <div class="matchup-list">
      ${opponentRows.map((row) => `
        <details class="matchup-row">
          <summary>
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <span>${row.wins}勝 ${row.losses}敗 ${row.draws}分 / ${row.total}戦 ${sampleLabel(row.total)}</span>
            </div>
            <div class="matchup-rate">
              <b>${row.winRate}%</b>
              <div class="rps-track"><div class="progress-fill" style="width:${row.winRate}%"></div></div>
            </div>
          </summary>
          <div class="matchup-detail">
            <span>先攻 ${turnRecordText(row.first)}</span>
            <span>後攻 ${turnRecordText(row.second)}</span>
          </div>
        </details>
      `).join("") || `<div class="empty-card">相手デッキを記録すると、苦手対面が見えてきます</div>`}
    </div>
  `;
}

function renderPlayers() {
  title.textContent = "プレイヤー";
  const selected = route.playerName;
  const rows = getPlayerBreakdown(state.matches);

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
                <span class="round-meta"><span>${escapeHtml(session?.name || "")}</span><span>${firstLabels[match.firstPlayer]}</span><span>相手${rpsLabels[match.opponentRps]}</span></span>
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
        return `
          <button class="list-card" type="button" data-open-session="${session.id}">
            <span class="badge">□</span>
            <span>
              <strong class="list-title">${escapeHtml(session.name)}</strong>
              <span class="list-meta"><span>${escapeHtml(deck?.name || "未設定")}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${formatDate(session.date)}</span></span>
            </span>
            <span class="score-pill">${sessionRecord(session.id)}</span>
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
    dialogFields.innerHTML = `<label>デッキ名<input name="name" required placeholder="例: 高木婚活"></label>`;
  }

  if (mode === "menu") {
    const pageAction = routeActionMarkup();
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "データメニュー";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `
      ${pageAction}
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
      <label>相手プレイヤーネーム<input name="opponentPlayer" list="playerSuggestions" required placeholder="例: 佐藤さん" value="${escapeHtml(editingMatch?.opponentPlayer || "")}"></label>
      <div class="inline-fields">
        <label>勝敗<select name="result">${optionTags([["win", "Win"], ["loss", "Lose"], ["draw", "Draw"]], editingMatch?.result || "win")}</select></label>
        <label>先/後<select name="firstPlayer">${optionTags([["first", "先攻"], ["second", "後攻"]], editingMatch?.firstPlayer || "first")}</select></label>
      </div>
      <label>じゃんけんで相手の出した手<select name="opponentRps">${optionTags([["rock", "グー"], ["scissors", "チョキ"], ["paper", "パー"], ["unknown", "未記録"]], editingMatch?.opponentRps || "rock")}</select></label>
      <div class="inline-fields">
        <label>自分のパス<select name="myPassed">${passOptions(editingMatch?.myPassed || "none")}</select></label>
        <label>相手のパス<select name="opponentPassed">${passOptions(editingMatch?.opponentPassed || "none")}</select></label>
      </div>
      <label>メモ<textarea name="memo" rows="3" placeholder="印象的だった展開、敗因など">${escapeHtml(editingMatch?.memo || "")}</textarea></label>
      ${editingMatch ? `<button class="danger-button" type="button" data-delete-editing-match>この試合を削除</button>` : ""}
    `;
  }

  dialog.showModal();
}

entryForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const data = new FormData(entryForm);

  if (dialogMode === "deck") {
    const deck = { id: crypto.randomUUID(), name: data.get("name").trim(), color: "purple" };
    state.decks.push(deck);
    route = { name: "deckDetail", deckId: deck.id };
  }

  if (dialogMode === "session") {
    const session = {
      id: editingSessionId || crypto.randomUUID(),
      deckId: data.get("deckId"),
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
      opponentPlayer: data.get("opponentPlayer").trim(),
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
  if (deckButton) setRoute({ name: "deckDetail", deckId: deckButton.dataset.openDeck });
  if (sessionButton) setRoute({ name: "session", sessionId: sessionButton.dataset.openSession });
  if (playerButton) setRoute({ name: "playerDetail", playerName: playerButton.dataset.openPlayer });
  if (editButton) openDialog("match", editButton.dataset.editMatch);
  if (editSessionButton) openDialog("session", editSessionButton.dataset.editSession);
  if (analysisDeckButton) setRoute({ name: "summary", deckId: analysisDeckButton.dataset.analysisDeck });
  if (analysisEnvironmentButton) setRoute({ name: "summary", deckId: route.deckId || state.decks[0]?.id, environment: analysisEnvironmentButton.dataset.analysisEnvironment });
});

dialogFields.addEventListener("click", (event) => {
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

function environmentOptions() {
  return uniqueValues([...(state.environments || []), ...state.sessions.map((session) => session.environment)]);
}

function preferredEnvironment() {
  return environmentOptions()[0] || "現環境";
}

function addEnvironment(environment) {
  state.environments = uniqueValues([...(state.environments || []), environment]);
}

function focusCard(label, value, note) {
  return `
    <article class="focus-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function turnLabel(value) {
  return value === "first" ? "先攻" : "後攻";
}

function turnRecordText(record) {
  return `${record.wins}-${record.total - record.wins} / ${record.winRate}%`;
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

function routeActionMarkup() {
  if (route.name === "deckDetail") {
    const deck = getDeck(route.deckId);
    if (!deck) return "";
    const sessionCount = sessionsForDeck(deck.id).length;
    const matchCount = matchesForDeck(deck.id).length;
    return `
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
