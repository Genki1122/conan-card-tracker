import {
  canWinRandomPrize,
  filterDecksByArchived,
  filterMatchesByEnvironment,
  filterMatchesByMonth,
  filterMatchesWithoutPasses,
  formatPercentage,
  formatRecordDate,
  formatRecordSummary,
  formatRecordSummaryWithRate,
  getColorMatchups,
  getCrossBreakdown,
  getMyPassUsage,
  getPlayerDeckOverviews,
  getPlayerOverviews,
  getPlayerRecord,
  getRecordedRpsBreakdown,
  getStaffRpsBreakdown,
  isCompletedMatch,
  isPassRecorded,
  isSmallSample,
  isKnownPlayerName,
  playerWinRateTone,
  sortPlayerOverviews,
  summarizeDecks,
  summarizeMatches,
  summarizeRounds
} from "./analytics.js";
import { stateSummary, statesEqual } from "./sync-state.js";
import { createInitialState, removeLegacyMockState } from "./initial-state.js";
import {
  accountOnboardingIntent,
  clearAccountOnboardingUrl,
  normalizeUsername,
  validateUsername
} from "./onboarding.js";
import {
  clearAuthChallenge,
  createAuthChallenge,
  isValidOtpCode,
  loadAuthChallenge,
  normalizeOtpCode,
  saveAuthChallenge
} from "./auth-challenge.js?v=55";
import {
  buildAdminDashboard,
  buildAdminOverview,
  buildAiTrainingDataset,
  filterAdminMatchups,
  filterAdminUsers
} from "./admin-analytics.js";
import { beginAdminPreview, endAdminPreview } from "./admin-view.js";
import { authEmailErrorMessage, authOtpErrorMessage } from "./auth-feedback.js?v=55";
import {
  activateAnonymousStorage,
  activateUserStorage,
  clearAnonymousStorage,
  readAnonymousStorageSources
} from "./account-storage.js";
import {
  hasAccountRecords,
  mergeAccountStates,
  recoverySummary
} from "./account-recovery.js";
import {
  buildRepairQueue,
  qualityFieldLabel,
  qualityFields,
  repairTargetForFields
} from "./data-quality.js";
import {
  mergeStoreName,
  previewPlayerNameHonorificTrim,
  renameEnvironmentInState,
  resolveSessionCreatedAt,
  sessionVersionOptions,
  sortSessionsNewestFirst,
  trimPlayerNamesAtHonorific,
  updateSessionDeck
} from "./data-operations.js";
import {
  caseCardColorLabel,
  caseCardsForPartnerColor,
  getCaseCard,
  isCaseCardAvailableForPartnerColor,
  normalizePartnerColor,
  partnerColorLabel,
  partnerColors
} from "./card-catalog.js";
import {
  buildSessionShareText,
  buildXShareUrl,
  isSessionShareAvailable
} from "./session-share.js";
import {
  normalizeSessionRelatedUrl,
  sessionRelatedUrlValidationMessage
} from "./session-links.js";
import {
  matchResultSelection,
  normalizeRoundRecord,
  roundFormState,
  sanitizeRoundRecord
} from "./rounds.js";
import {
  filterMatchesByRecordType,
  filterSessionsByRecordType,
  normalizeRecordType,
  recordTypeLabel,
  sanitizeSessionForRecordType
} from "./record-types.js";
import { shouldUpdateSearchFromInput } from "./ime-input.js";
import {
  filterPlayerNameSuggestions,
  replaceWithPlayerNameSuggestion
} from "./player-names.js";
import {
  filterMatchupRecords,
  passBadgeItems
} from "./matchup-detail.js";
import {
  latestRelease,
  markReleaseSeen,
  normalizeReleaseManifest,
  readSeenReleaseVersion,
  releaseForVersion,
  unseenRelease
} from "./release-notes.js";
import {
  addEnvironmentCatalogItem,
  cloudSnapshot,
  deleteEnvironmentCatalogItem,
  getCloudConfig,
  initializeCloud,
  isCloudConfigured,
  loadAccountContext,
  loadAdminData,
  loadAdminEnvironmentCatalog,
  loadAdminUserState,
  loadCloudState,
  loadEnvironmentCatalog,
  renameEnvironmentCatalogItem,
  saveAccountRecoveryStatus,
  saveAccountSetup,
  saveCloudConfig,
  saveCloudState,
  signInWithEmail,
  signOutCloud,
  updateProfileUsername,
  verifyEmailOtp
} from "./cloud.js?v=55";

const storageBaseKey = "conan-card-tracker-v2";
const legacyStorageKey = "conan-card-match-casebook";
const syncMetaBaseKey = "conan-card-tracker-sync-meta-v1";
const termsVersion = "2026-07-23-v2";
const appVersion = "55";
const initialStorageScope = activateAnonymousStorage({
  stateBaseKey: storageBaseKey,
  syncBaseKey: syncMetaBaseKey
});
let storageKey = initialStorageScope.stateKey;
let syncMetaStorageKey = initialStorageScope.syncKey;
let activeStorageUserId = "";
let storageEpoch = 0;

const view = document.querySelector("#appView");
const phoneShell = document.querySelector(".phone-shell");
const title = document.querySelector("#screenTitle");
const topBar = document.querySelector(".top-bar");
const syncStatusLabel = document.querySelector("#syncStatus");
const backButton = document.querySelector("#backButton");
const fabButton = document.querySelector("#fabButton");
const updateBanner = document.querySelector("#updateBanner");
const updateBannerTitle = document.querySelector("#updateBannerTitle");
const updateBannerSummary = document.querySelector("#updateBannerSummary");
const showUpdateDetailsButton = document.querySelector("#showUpdateDetailsButton");
const applyUpdateButton = document.querySelector("#applyUpdateButton");
const dialog = document.querySelector("#entryDialog");
const entryForm = document.querySelector("#entryForm");
const dialogKicker = document.querySelector("#dialogKicker");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const dialogSubmit = document.querySelector("#dialogSubmit");
const caseCardDialog = document.querySelector("#caseCardDialog");
const caseCardDialogKicker = document.querySelector("#caseCardDialogKicker");
const caseCardDialogClose = document.querySelector("#caseCardDialogClose");
const caseCardSearch = document.querySelector("#caseCardSearch");
const caseCardOptionsView = document.querySelector("#caseCardOptions");
const caseCardClear = document.querySelector("#caseCardClear");
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
let accountOnboardingActive = accountOnboardingIntent(window.location.search);
let cloudConflict = false;
let pendingRemoteState = null;
let accountContext = { schemaReady: false, username: "", termsAccepted: false, termsVersion: "", role: "" };
let adminState = { loading: false, error: "", data: null, raw: null };
let adminPreview = null;
let registrationFeedback = loadAuthChallenge(localStorage);
let environmentCatalog = [];
let environmentCatalogReady = false;
let environmentCatalogError = "";
let environmentCatalogMessage = "";
let dataSettingsMessage = "";
let accountRecovery = { anonymous: null, preview: null, message: "", saving: false };
let activeCaseCardScope = "";
let caseCardReturnFocus = null;
let releaseManifest = normalizeReleaseManifest();
let releaseLoadPromise = null;
let availableRelease = null;

const rpsLabels = { rock: "グー", scissors: "チョキ", paper: "パー", unknown: "未記録" };
const resultLabels = { pending: "未確定", win: "Win", loss: "Lose", draw: "Draw" };
const resultFilterLabels = { all: "勝敗すべて", win: "勝ち", loss: "負け", draw: "引分" };
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
const analysisPivotOptions = [
  ["opponentDeck", "相手デッキ"],
  ["opponentColor", "相手色"],
  ["colorMatrix", "色対面表"],
  ["myDeck", "自分デッキ"],
  ["month", "月別"],
  ["deckVersion", "バージョン"],
  ["environment", "環境"],
  ["store", "店舗"],
  ["opponentPlayer", "プレイヤー"]
];
const drilldownPivots = new Set(analysisPivotOptions.map(([value]) => value).filter((value) => value !== "colorMatrix"));

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) return normalizeState(removeLegacyMockState(saved));
  } catch {
    // Ignore malformed local data and fall back to a clean state.
  }

  if (activeStorageUserId) return normalizeState(createInitialState());

  try {
    const legacyState = JSON.parse(localStorage.getItem(storageBaseKey));
    if (legacyState) return normalizeState(removeLegacyMockState(legacyState));
  } catch {
    // Ignore old unscoped state that cannot be migrated.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey)) || [];
    if (legacy.length > 0) return normalizeState(removeLegacyMockState(migrateLegacyMatches(legacy)));
  } catch {
    // Ignore old data that cannot be migrated.
  }

  return normalizeState(createInitialState());
}

function activateUserLocalState(userId) {
  if (!userId || activeStorageUserId === userId) return;
  window.clearTimeout(cloudSaveTimer);
  const scope = activateUserStorage(localStorage, {
    stateBaseKey: storageBaseKey,
    syncBaseKey: syncMetaBaseKey,
    userId
  });
  storageKey = scope.stateKey;
  syncMetaStorageKey = scope.syncKey;
  activeStorageUserId = userId;
  storageEpoch += 1;
  state = loadState();

  syncMeta = loadSyncMeta();
  cloudUpdatedAt = syncMeta.updatedAt || null;
  localDirty = Boolean(syncMeta.dirty);
  cloudConflict = false;
  pendingRemoteState = null;
  route = validRouteAfterSync(route);
}

function activateAnonymousLocalState() {
  window.clearTimeout(cloudSaveTimer);
  const scope = activateAnonymousStorage({
    stateBaseKey: storageBaseKey,
    syncBaseKey: syncMetaBaseKey
  });
  storageKey = scope.stateKey;
  syncMetaStorageKey = scope.syncKey;
  activeStorageUserId = "";
  storageEpoch += 1;
  state = loadState();
  syncMeta = loadSyncMeta();
  cloudUpdatedAt = syncMeta.updatedAt || null;
  localDirty = Boolean(syncMeta.dirty);
  cloudConflict = false;
  pendingRemoteState = null;
  route = { name: "decks" };
}

async function refreshAccountRecovery() {
  if (!cloudStatus.signedIn || adminPreview) {
    accountRecovery = { anonymous: null, preview: null, message: "", saving: false };
    return;
  }
  const sources = readAnonymousStorageSources(localStorage, { stateBaseKey: storageBaseKey })
    .map((entry) => normalizeState(removeLegacyMockState(entry.state)));
  try {
    const legacyMatches = JSON.parse(localStorage.getItem(legacyStorageKey)) || [];
    if (Array.isArray(legacyMatches) && legacyMatches.length) {
      sources.push(normalizeState(removeLegacyMockState(migrateLegacyMatches(legacyMatches))));
    }
  } catch {
    // A malformed legacy source is left untouched for manual recovery.
  }
  const anonymous = sources.length
    ? sources.reduce((combined, source) => normalizeState(mergeAccountStates(combined, source).state))
    : null;
  if (!anonymous || !hasAccountRecords(anonymous)) {
    accountRecovery = { anonymous: null, preview: null, message: "", saving: false };
    return;
  }

  const preview = mergeAccountStates(state, anonymous);
  accountRecovery = { anonymous, preview, message: "", saving: false };
  try {
    await saveAccountRecoveryStatus({
      status: "detected",
      anonymous: preview.anonymous,
      ambiguousCount: preview.ambiguous.length
    });
  } catch {
    // Recovery still works locally when the optional status migration is not installed.
  }
}

function recoveryNoticeMarkup() {
  if (!cloudStatus.signedIn || adminPreview || !accountRecovery.preview || route.name === "recovery") return "";
  const summary = accountRecovery.preview.anonymous;
  return `
    <button class="account-recovery-notice" type="button" data-open-account-recovery>
      <span><strong>未ログイン時の記録があります</strong><small>${summary.decks}デッキ・${summary.sessions}大会・${summary.matches}試合</small></span>
      <b>確認する</b>
    </button>
  `;
}

function renderRecovery() {
  title.textContent = "データ引き継ぎ";
  const preview = accountRecovery.preview;
  if (!preview) {
    view.innerHTML = `<div class="empty-card">引き継ぎ対象のデータはありません</div>`;
    return;
  }
  view.innerHTML = `
    ${accountRecovery.message ? `<p class="cloud-message recovery-page-message" role="status">${escapeHtml(accountRecovery.message)}</p>` : ""}
    <section class="recovery-compare">
      ${recoverySummaryCard("アカウント", preview.account)}
      ${recoverySummaryCard("未ログイン", preview.anonymous)}
      ${recoverySummaryCard("統合後", preview.merged, "result")}
    </section>
    <section class="recovery-assurance">
      <strong>元データはクラウド保存が完了するまで削除しません</strong>
      <span>同じIDの記録だけを自動統合し、判断が必要なものは下で確認します。</span>
    </section>
    ${preview.ambiguous.length ? `
      <section class="recovery-duplicates">
        <div><strong>重複候補 ${preview.ambiguous.length}件</strong><span>同じ記録の場合だけチェックしてください</span></div>
        ${preview.ambiguous.map((item, index) => `
          <label>
            <input type="checkbox" data-recovery-duplicate="${index}">
            <span><b>${escapeHtml(recoveryTypeLabel(item.type))}</b><small>${escapeHtml(item.label)}</small></span>
          </label>
        `).join("")}
      </section>
    ` : ""}
    <div class="recovery-actions">
      <button class="primary-button inline-action ghost-action" type="button" data-download-recovery-backup>統合前JSONを保存</button>
      <button class="primary-button inline-action" type="button" data-confirm-account-recovery ${accountRecovery.saving ? "disabled" : ""}>${accountRecovery.saving ? "クラウド保存中" : "このアカウントに統合"}</button>
    </div>
  `;
}

function recoverySummaryCard(label, summary, className = "") {
  return `
    <article class="${className}">
      <strong>${label}</strong>
      <span>${summary.decks}<small>デッキ</small></span>
      <span>${summary.sessions}<small>大会</small></span>
      <span>${summary.matches}<small>試合</small></span>
    </article>
  `;
}

function recoveryTypeLabel(type) {
  return ({ deck: "デッキ", session: "大会", match: "試合" })[type] || "記録";
}

function selectedRecoveryDuplicatePairs() {
  const preview = accountRecovery.preview;
  if (!preview) return [];
  return [...view.querySelectorAll("[data-recovery-duplicate]:checked")]
    .map((input) => preview.ambiguous[Number(input.dataset.recoveryDuplicate)])
    .filter(Boolean);
}

function recoveryBackupPayload() {
  return {
    format: "conan-card-tracker-recovery-v1",
    exportedAt: new Date().toISOString(),
    userId: cloudStatus.userId,
    account: state,
    anonymous: accountRecovery.anonymous
  };
}

function saveRecoveryBackup() {
  const payload = recoveryBackupPayload();
  const text = JSON.stringify(payload, null, 2);
  localStorage.setItem(`conan-card-recovery-backup:${cloudStatus.userId}`, text);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `conan-card-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function confirmAccountRecovery() {
  if (!accountRecovery.preview || !accountRecovery.anonymous || accountRecovery.saving) return;
  saveRecoveryBackup();
  const previousState = structuredClone(state);
  const previousDirty = localDirty;
  const previousUpdatedAt = cloudUpdatedAt;
  const merged = mergeAccountStates(state, accountRecovery.anonymous, {
    sameRecordPairs: selectedRecoveryDuplicatePairs()
  });
  accountRecovery = { ...accountRecovery, preview: merged, saving: true, message: "統合内容をクラウドへ保存しています" };
  render();
  try {
    await saveAccountRecoveryStatus({
      status: "saving",
      anonymous: merged.anonymous,
      ambiguousCount: merged.ambiguous.length
    });
  } catch {
    // Status reporting is optional; the account data save remains authoritative.
  }

  state = normalizeState(merged.state);
  localStorage.setItem(storageKey, JSON.stringify(state));
  markLocalDirty();
  const saved = await pushCloudState({ silent: true });
  if (!saved) {
    state = previousState;
    localStorage.setItem(storageKey, JSON.stringify(state));
    localDirty = previousDirty;
    cloudUpdatedAt = previousUpdatedAt;
    saveSyncMeta();
    accountRecovery = { ...accountRecovery, saving: false, message: "保存できませんでした。元データは変更していません。" };
    try {
      await saveAccountRecoveryStatus({
        status: "failed",
        anonymous: merged.anonymous,
        ambiguousCount: merged.ambiguous.length,
        errorCode: cloudConflict ? "cloud_conflict" : "cloud_save_failed"
      });
    } catch {
      // Keep the local recovery UI available even if status reporting fails.
    }
    render();
    return;
  }

  clearAnonymousStorage(localStorage, {
    stateBaseKey: storageBaseKey,
    syncBaseKey: syncMetaBaseKey,
    legacyStateKey: legacyStorageKey
  });
  try {
    await saveAccountRecoveryStatus({
      status: "resolved",
      anonymous: merged.anonymous,
      ambiguousCount: merged.ambiguous.length
    });
  } catch {
    // The account data is already safely stored.
  }
  accountRecovery = { anonymous: null, preview: null, message: "", saving: false };
  cloudMessage = `未ログイン時の${merged.anonymous.matches}試合を統合しました`;
  route = { name: "decks" };
  render();
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
      lastUsedAt: deck.lastUsedAt || dates.sort().at(-1) || "",
      partnerColor: normalizePartnerColor(deck.partnerColor),
      caseCardId: String(deck.caseCardId || "")
    };
  });
  const deckVersions = new Map(decks.map((deck) => [deck.id, deck.version]));
  const sessionEnvironments = (rawState.sessions || []).map((session) => normalizeEnvironmentName(session.environment));
  return {
    decks,
    sessions: rawSessions.map((session) => sanitizeSessionForRecordType({
      ...session,
      recordType: normalizeRecordType(session.recordType),
      environment: normalizeEnvironmentName(session.environment),
      relatedUrl: normalizeSessionRelatedUrl(session.relatedUrl),
      deckVersion: session.deckVersion || deckVersions.get(session.deckId) || "v1",
      partnerColor: normalizePartnerColor(session.partnerColor),
      caseCardId: String(session.caseCardId || ""),
      placement: session.placement || "",
      placementNote: session.placementNote || "",
      randomPrizeWon: canWinRandomPrize(session.placement) ? Boolean(session.randomPrizeWon) : false,
      randomPrizeMethod: session.randomPrizeMethod || "",
      randomPrizeMethodNote: session.randomPrizeMethodNote || "",
      staffRpsHands: [0, 1, 2].map((index) => session.staffRpsHands?.[index] || "")
    })),
    environments: uniqueValues([...(rawState.environments || []).map(normalizeEnvironmentName), ...sessionEnvironments]),
    matches: (rawState.matches || []).map((match) => normalizeRoundRecord({
      ...match,
      opponentPlayer: normalizePlayerName(match.opponentPlayer),
      opponentPartnerColor: normalizePartnerColor(match.opponentPartnerColor),
      opponentCaseCardId: String(match.opponentCaseCardId || ""),
      result: ["win", "loss", "draw"].includes(match.result) ? match.result : "pending"
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
    partnerColor: "",
    caseCardId: "",
    archived: false,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString()
  }));
  const sessions = decks.map((deck) => ({
    id: crypto.randomUUID(),
    deckId: deck.id,
    recordType: "challenge",
    deckVersion: deck.version,
    partnerColor: "",
    caseCardId: "",
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
        opponentPartnerColor: "",
        opponentCaseCardId: "",
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

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function normalizePlayerName(value) {
  const name = String(value || "").trim();
  return !name || name === "未登録" ? "不明" : name;
}

function saveState() {
  if (adminPreview) return;
  localStorage.setItem(storageKey, JSON.stringify(state));
  markLocalDirty();
  scheduleCloudSave();
}

function scheduleCloudSave() {
  if (adminPreview || !cloudStatus.signedIn || cloudConflict) return;
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
  if (adminPreview || !cloudStatus.signedIn || cloudConflict) return;
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return;
  }

  cloudSaveInFlight = true;
  cloudSavePending = false;
  const requestEpoch = storageEpoch;
  const snapshot = JSON.parse(JSON.stringify(state));
  renderSyncStatus();
  try {
    const updatedAt = await saveCloudState(snapshot, { expectedUpdatedAt: cloudUpdatedAt });
    if (requestEpoch !== storageEpoch) return;
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
    if (requestEpoch !== storageEpoch) return;
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
  if (adminPreview) {
    syncStatusLabel.textContent = `${adminPreview.username}・閲覧専用`;
    syncStatusLabel.dataset.tone = "preview";
    return;
  }
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
  suggestionLists.environments.innerHTML = optionList(uniqueValues([
    ...catalogEnvironmentOptions(),
    ...state.sessions.map((session) => session.environment)
  ]));
}

function optionList(values) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function knownPlayerNames() {
  return uniqueValues(state.matches.map((match) => match.opponentPlayer).filter(isKnownPlayerName));
}

function playerNameFieldMarkup({ name, label, value, id }) {
  const suggestionsId = `${id}-suggestions`;
  return `
    <div class="player-name-field">
      <label for="${id}">${label}</label>
      <input id="${id}" name="${name}" required value="${escapeHtml(value)}" placeholder="不明" autocomplete="off" data-player-name-input aria-autocomplete="list" aria-controls="${suggestionsId}" aria-expanded="false">
      <div id="${suggestionsId}" class="player-name-suggestions" data-player-name-suggestions role="listbox" hidden></div>
    </div>
  `;
}

function updatePlayerNameSuggestions(input) {
  const menu = input.closest(".player-name-field")?.querySelector("[data-player-name-suggestions]");
  if (!menu) return;
  const suggestions = filterPlayerNameSuggestions(knownPlayerNames(), input.value);
  menu.innerHTML = suggestions.map((name) => `
    <button type="button" role="option" data-player-name-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  menu.hidden = suggestions.length === 0;
  input.setAttribute("aria-expanded", String(suggestions.length > 0));
}

function setRoute(nextRoute) {
  const restoreScrollY = Number.isFinite(nextRoute?.restoreScrollY) ? nextRoute.restoreScrollY : null;
  const restoreFocus = String(nextRoute?.restoreFocus || "");
  route = { ...nextRoute };
  delete route.restoreScrollY;
  delete route.restoreFocus;
  render();
  requestAnimationFrame(() => {
    if (restoreScrollY !== null) window.scrollTo({ top: restoreScrollY, behavior: "auto" });
    if (restoreFocus) document.querySelector(restoreFocus)?.focus({ preventScroll: true });
  });
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

function pendingMatchesForSession(sessionId) {
  return matchesForSession(sessionId).filter((match) => match.result === "pending");
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
    const deck = getDeck(session?.deckId);
    return {
      ...match,
      recordType: normalizeRecordType(session?.recordType),
      environment: session?.environment || "未設定",
      deckVersion: session?.deckVersion || "v1",
      store: session?.name || "未設定",
      date: session?.date || "",
      myPartnerColor: session?.partnerColor || deck?.partnerColor || "",
      opponentColor: match.opponentPartnerColor ? partnerColorLabel(match.opponentPartnerColor) : "",
      opponentCaseCard: getCaseCard(match.opponentCaseCardId)?.name || "",
      order: index
    };
  });
}

function analysisMatchesForDeck(deckId, environment = "", store = "", deckVersion = "", recordType = "challenge") {
  const sessions = state.sessions.filter((session) => (
    (!deckId || session.deckId === deckId)
    &&
    (!environment || session.environment === environment)
    && (!store || session.name === store)
    && (!deckVersion || session.deckVersion === deckVersion)
    && (normalizeRecordType(recordType, { allowAll: true }) === "all" || normalizeRecordType(session.recordType) === normalizeRecordType(recordType))
  ));
  const ids = new Set(sessions.map((session) => session.id));
  return enrichMatches(state.matches.filter((match) => ids.has(match.sessionId)));
}

function storesForDeck(deckId, environment = "", deckVersion = "", recordType = "challenge") {
  return uniqueValues(
    filterSessionsByRecordType(state.sessions, recordType)
      .filter((session) => !deckId || session.deckId === deckId)
      .filter((session) => !environment || session.environment === environment)
      .filter((session) => !deckVersion || session.deckVersion === deckVersion)
      .map((session) => session.name)
  );
}

function versionsForDeck(deckId, recordType = "challenge") {
  if (!deckId) return [];
  return uniqueValues(filterSessionsByRecordType(sessionsForDeck(deckId), recordType).map((session) => session.deckVersion || "v1"));
}

function analysisMonths(recordType = "all") {
  const current = relativeMonth(0);
  const previous = relativeMonth(-1);
  const sessions = filterSessionsByRecordType(state.sessions, recordType);
  return uniqueValues([current, previous, ...sessions.map((session) => String(session.date || "").slice(0, 7))]).sort().reverse();
}

function relativeMonth(offset) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function splitPassRecord(matches) {
  return {
    myNoPass: summarizeMatches(matches.filter((match) => !isPassRecorded(match.myPassed))),
    myAnyPass: summarizeMatches(matches.filter((match) => isPassRecorded(match.myPassed))),
    opponentNoPass: summarizeMatches(matches.filter((match) => !isPassRecorded(match.opponentPassed))),
    opponentAnyPass: summarizeMatches(matches.filter((match) => isPassRecorded(match.opponentPassed)))
  };
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

function environmentsForDeck(deckId, deckVersion = "", recordType = "challenge") {
  return uniqueValues(
    filterSessionsByRecordType(state.sessions, recordType)
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
  const pending = pendingMatchesForSession(session.id);
  return `
    <span class="session-card-status">
      <span class="result-chip-row">${sessionResultChips(session)}</span>
      ${pending.length ? `<span class="pending-match-chip" ${adminPreview ? "" : `data-open-pending-match="${pending[0].id}"`}>未確定 ${pending.length}</span>` : ""}
      <span class="score-pill ${recordToneClass(summary)}">${sessionRecord(session.id)}</span>
    </span>
  `;
}

function sessionsForStore(storeName) {
  return sortSessionsNewestFirst(
    filterSessionsByRecordType(state.sessions, "challenge").filter((session) => session.name === storeName)
  );
}

function sessionRecord(sessionId) {
  const summary = sessionSummary(sessionId);
  return `${summary.wins}-${summary.losses}${summary.draws ? `-${summary.draws}` : ""}`;
}

function sessionSummary(sessionId) {
  return summarizeRounds(matchesForSession(sessionId));
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

function recordStrip(summary, meta = [], badge = "", extraMetric = null) {
  return `
    <section class="record-strip ${extraMetric ? "with-extra-metric" : ""}">
      <div><span>戦績</span><strong>${recordText(summary)}</strong></div>
      <div><span>勝率</span><strong>${summary.winRate || 0}%</strong></div>
      ${extraMetric ? `<div><span>${escapeHtml(extraMetric.label)}</span><strong>${escapeHtml(extraMetric.value)}</strong></div>` : ""}
      <p>${extraMetric && meta.length > 1
        ? `<span>${meta[0]}</span><span class="record-strip-counts">${meta.slice(1).map((item) => `<b>${item}</b>`).join("")}</span>`
        : meta.map((item) => `<span>${item}</span>`).join("")}</p>
      ${badge ? `<i>${escapeHtml(badge)}</i>` : ""}
    </section>
  `;
}

function deckTypeRecordStrip(summary, passUsage) {
  return `
    <section class="record-strip deck-type-record-strip">
      <div><span>戦績</span><strong>${recordText(summary)}</strong></div>
      <div><span>勝率</span><strong>${formatPercentage(summary.winRate)}</strong></div>
      <div><span>パス率</span><strong>${formatPercentage(passUsage.rate)}</strong></div>
      <div><span>試合数</span><strong>${summary.total}</strong></div>
    </section>
  `;
}

function renderDecks() {
  title.textContent = "デッキ選択";
  const archivedView = route.deckView === "archived";
  const visibleIds = new Set(filterDecksByArchived(state.decks, archivedView).map((deck) => deck.id));
  const visibleSessions = filterSessionsByRecordType(
    state.sessions.filter((session) => visibleIds.has(session.deckId)),
    "challenge"
  );
  const visibleSessionIds = new Set(visibleSessions.map((session) => session.id));
  const visibleMatches = state.matches.filter((match) => visibleSessionIds.has(match.sessionId));
  const decks = summarizeDecks(state.decks, visibleSessions, visibleMatches)
    .filter((deck) => visibleIds.has(deck.id))
    .sort((a, b) => deckRecency(getDeck(b.id)).localeCompare(deckRecency(getDeck(a.id))));
  const overall = summarizeMatches(visibleMatches);
  const archivedCount = filterDecksByArchived(state.decks, true).length;
  const activeCount = state.decks.length - archivedCount;

  view.innerHTML = `
    ${recordStrip(overall, [`${decks.length}デッキ`, `${visibleSessions.length}大会`, `${overall.total}試合`])}
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
  const selectedRecordType = normalizeRecordType(route.recordType);
  const deckSessions = sortSessionsNewestFirst(
    filterSessionsByRecordType(sessionsForDeck(deckId), selectedRecordType)
  );
  const deckMatches = filterMatchesByRecordType(enrichMatches(matchesForDeck(deckId)), selectedRecordType);
  const summary = summarizeMatches(deckMatches);
  const passUsage = getMyPassUsage(deckMatches);

  title.textContent = deck.name;
  view.innerHTML = `
    ${deckTypeRecordStrip(summary, passUsage)}
    <div class="record-type-tabs" role="tablist" aria-label="記録種別">
      ${[
        ["challenge", "チャレンジ"],
        ["free", "フリー"],
        ["tuning", "調整"]
      ].map(([value, label]) => `<button type="button" role="tab" data-deck-record-type="${value}" aria-selected="${selectedRecordType === value}" class="${selectedRecordType === value ? "active" : ""}">${label}</button>`).join("")}
    </div>
    <div class="list-stack compact-session-list">
      ${deckSessions.map((session) => {
        const count = matchesForSession(session.id).length;
        const summary = sessionSummary(session.id);
        return `
          <button class="list-card compact-session-card" type="button" data-open-session="${session.id}">
            <span class="session-card-copy">
              <span class="session-title-line"><strong class="list-title">${escapeHtml(session.name || recordTypeLabel(session.recordType))}</strong></span>
              <span class="list-meta"><span>${formatDate(session.date)}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${count}ラウンド</span></span>
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
  const summary = summarizeRounds(rounds);
  const pendingRounds = pendingMatchesForSession(sessionId);
  const deck = getDeck(session.deckId);
  const shareUrl = buildXShareUrl(buildSessionShareText({ session, deck, matches: rounds }));
  const relatedUrl = normalizeSessionRelatedUrl(session.relatedUrl);

  title.textContent = session.name || recordTypeLabel(session.recordType);
  view.innerHTML = `
    <section class="session-compact-head">
      <div class="session-record"><span>戦績</span><strong>${recordText(summary)}</strong><b>${summary.winRate}%</b>${pendingRounds.length ? `<${adminPreview ? "span" : "button"} class="pending-match-chip" ${adminPreview ? "" : `type="button" data-open-pending-match="${pendingRounds[0].id}"`}>未確定 ${pendingRounds.length}</${adminPreview ? "span" : "button"}>` : ""}</div>
      ${adminPreview ? `<span class="read-only-badge">閲覧専用</span>` : `
        <div class="session-head-actions">
          <button type="button" data-edit-session="${session.id}">編集</button>
          ${isSessionShareAvailable(session) ? `<a class="session-share-button" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener noreferrer" data-session-share data-pending-count="${pendingRounds.length}" aria-label="Xに結果を投稿" title="Xに結果を投稿">X</a>` : ""}
        </div>
      `}
      <p>${normalizeRecordType(session.recordType) === "challenge" || !session.name ? "" : `<span class="session-type-chip">${escapeHtml(recordTypeLabel(session.recordType))}</span>`}<span>${formatDate(session.date)}</span><span>${escapeHtml(session.deckVersion || "v1")}</span><span>${escapeHtml(session.environment || "未設定")}</span><span>${escapeHtml(session.format || "BO1")}</span>${relatedUrl ? `<a class="session-related-link" href="${escapeHtml(relatedUrl)}" target="_blank" rel="noopener noreferrer" aria-label="関連URLを新しいタブで開く">関連リンク ↗</a>` : ""}</p>
      ${isSessionShareAvailable(session) && (session.placement || session.randomPrizeMethod || session.randomPrizeWon) ? `<div class="session-compact-outcome"><span class="result-chip-row">${sessionResultChips(session)}</span><span>${escapeHtml(placementLabels[session.placement] || session.placementNote || "")}</span><span>${escapeHtml(prizeMethodLabels[session.randomPrizeMethod] || session.randomPrizeMethodNote || "")}</span></div>` : ""}
    </section>
    <div class="section-title-row"><h2>ラウンド</h2><span>${rounds.length}ラウンド</span></div>
    <div class="list-stack">
      ${rounds.map((match, index) => {
        const isBye = match.roundType === "bye";
        return `
          <article class="round-card compact-round ${isBye ? "bye-round" : ""}">
            ${historyRecordCardMarkup(match, {
              className: "session-round-history-card",
              primary: `<b class="round-history-number">${index + 1}</b><span>${isBye ? "不戦勝" : `${escapeHtml(match.opponentDeck || "デッキ未記録")}・${escapeHtml(normalizePlayerName(match.opponentPlayer))}`}</span>`,
              secondary: isBye ? ["対戦なし"] : [
                firstLabels[match.firstPlayer] || "先後未記録",
                getCaseCard(match.opponentCaseCardId)?.name || "事件未記録",
                `相手${rpsLabels[match.opponentRps] || "未記録"}`
              ]
            })}
            ${isBye ? "" : `
              <details class="round-extra">
                <summary>詳細</summary>
                <div class="detail-grid">
                  <span>相手: ${escapeHtml(normalizePlayerName(match.opponentPlayer))}</span>
                  ${(match.opponentPartnerColor || match.opponentCaseCardId) ? `<span>色・事件: ${escapeHtml(partnerColorLabel(match.opponentPartnerColor))}${match.opponentCaseCardId ? `・${escapeHtml(getCaseCard(match.opponentCaseCardId)?.name || "事件カード未記録")}` : ""}</span>` : ""}
                  <span>じゃんけん: 相手${rpsLabels[match.opponentRps]}</span>
                  <span>パス 自分:${passLabel(match.myPassed)} 相手:${passLabel(match.opponentPassed)}</span>
                  ${match.memo ? `<span>メモ: ${escapeHtml(match.memo)}</span>` : ""}
                  ${adminPreview ? "" : `<button class="text-button" type="button" data-edit-match="${match.id}">編集する</button>`}
                </div>
              </details>
            `}
          </article>
        `;
      }).join("") || `<div class="empty-card">＋ からこのセッションのラウンドを記録しましょう</div>`}
    </div>
  `;
}

function resolveAnalysisContext(sourceRoute = route) {
  const selectedRecordType = normalizeRecordType(sourceRoute.recordType, { allowAll: true });
  const selectedDeckId = sourceRoute.deckId && getDeck(sourceRoute.deckId) ? sourceRoute.deckId : "";
  const versions = selectedDeckId ? versionsForDeck(selectedDeckId, selectedRecordType) : [];
  const selectedVersion = sourceRoute.version && versions.includes(sourceRoute.version) ? sourceRoute.version : "";
  const environments = environmentsForDeck(selectedDeckId, selectedVersion, selectedRecordType);
  const selectedEnvironment = sourceRoute.environment && environments.includes(sourceRoute.environment) ? sourceRoute.environment : "";
  const stores = storesForDeck(selectedDeckId, selectedEnvironment, selectedVersion, selectedRecordType);
  const selectedStore = sourceRoute.store && stores.includes(sourceRoute.store) ? sourceRoute.store : "";
  const months = analysisMonths(selectedRecordType);
  const selectedMonth = sourceRoute.month && months.includes(sourceRoute.month) ? sourceRoute.month : "";
  const selectedPivot = analysisPivotOptions.some(([value]) => value === sourceRoute.pivot) ? sourceRoute.pivot : "opponentDeck";
  const selectedSort = ["total", "low", "high"].includes(sourceRoute.sort) ? sourceRoute.sort : "total";
  return {
    selectedRecordType,
    selectedDeckId,
    selectedVersion,
    selectedEnvironment,
    selectedStore,
    selectedMonth,
    selectedPivot,
    selectedSort,
    excludePasses: Boolean(sourceRoute.excludePasses),
    minimumColorSamples: Boolean(sourceRoute.minimumColorSamples),
    versions,
    environments,
    stores,
    months
  };
}

function renderSummary() {
  title.textContent = "分析";
  const {
    selectedRecordType,
    selectedDeckId,
    selectedVersion,
    selectedEnvironment,
    selectedStore,
    selectedMonth,
    selectedPivot,
    selectedSort,
    excludePasses,
    minimumColorSamples,
    versions,
    environments,
    stores,
    months
  } = resolveAnalysisContext();
  const deck = getDeck(selectedDeckId);
  const baseMatches = analysisMatchesForDeck(selectedDeckId, selectedEnvironment, selectedStore, selectedVersion, selectedRecordType).filter(isCompletedMatch);
  const monthMatches = filterMatchesByMonth(baseMatches, selectedMonth);
  const matches = excludePasses ? filterMatchesWithoutPasses(monthMatches) : monthMatches;
  const summary = summarizeMatches(matches);
  const passRecord = splitPassRecord(matches);
  const breakdownMatches = selectedPivot === "opponentPlayer"
    ? matches.filter((match) => isKnownPlayerName(match.opponentPlayer))
    : selectedPivot === "opponentColor"
      ? matches.filter((match) => match.opponentColor)
      : matches;
  const rows = selectedPivot === "colorMatrix"
    ? []
    : sortCrossRows(getCrossBreakdown(breakdownMatches, selectedPivot), selectedSort);
  const colorMatchups = getColorMatchups(matches, minimumColorSamples ? 11 : 1);
  const selectedColorMatchup = colorMatchups.find((row) => (
    `${row.myColor}:${row.opponentColor}` === route.colorMatchup
  ));
  const repairQueue = adminPreview ? [] : buildRepairQueue(state);

  view.innerHTML = `
    ${repairQueue.length ? `
      <button class="missing-data-chip" type="button" data-open-repair>
        <span>未記録の項目があります</span><strong>${repairQueue.length}試合</strong><b>›</b>
      </button>
    ` : ""}
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
    <div class="analysis-secondary-filters">
      <details class="analysis-filter-panel">
        <summary>詳細条件${[selectedVersion, selectedEnvironment, selectedStore, selectedRecordType === "challenge" ? "" : selectedRecordType].filter(Boolean).length ? ` ${[selectedVersion, selectedEnvironment, selectedStore, selectedRecordType === "challenge" ? "" : selectedRecordType].filter(Boolean).length}` : ""}</summary>
        <div class="analysis-filter-grid">
          <label>記録種別<select data-analysis-record-type>${optionTags([["challenge", "チャレンジ戦"], ["free", "フリー対戦"], ["tuning", "調整対戦"], ["all", "すべて"]], selectedRecordType)}</select></label>
          <label>バージョン<select data-analysis-version-select ${selectedDeckId ? "" : "disabled"}><option value="">すべて</option>${versions.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedVersion ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
          <label>環境<select data-analysis-environment-select><option value="">すべて</option>${environments.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedEnvironment ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
          <label>店舗<select data-analysis-store-select><option value="">すべて</option>${stores.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedStore ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>
        </div>
      </details>
      <label class="analysis-pass-toggle"><input type="checkbox" data-analysis-exclude-passes ${excludePasses ? "checked" : ""}><span>パスを除く</span></label>
    </div>

    <section class="analysis-hero">
      <div>
        <span class="label">${escapeHtml(deck?.name || "全デッキ")} / ${selectedMonth ? formatMonth(selectedMonth) : "全期間"}</span>
        <strong>${formatPercentage(summary.winRate)}</strong>
        <small>${summary.wins}勝 ${summary.losses}敗 ${summary.draws || 0}分 / ${summary.total}戦</small>
      </div>
      <div class="mini-metrics">
        <span>先 ${formatPercentage(summary.first.winRate)}</span>
        <span>後 ${formatPercentage(summary.second.winRate)}</span>
      </div>
    </section>

    <section class="breakdown-panel">
      <h2>内訳</h2>
      <div class="breakdown-grid">
        ${breakdownCard("総合", formatRecordSummary(summary), formatPercentage(summary.winRate))}
        ${breakdownCard("先攻", formatRecordSummary(summary.first), formatPercentage(summary.first.winRate))}
        ${breakdownCard("後攻", formatRecordSummary(summary.second), formatPercentage(summary.second.winRate))}
        ${breakdownCard("自分パス無", formatRecordSummary(passRecord.myNoPass), formatPercentage(passRecord.myNoPass.winRate))}
        ${breakdownCard("自分パス有", formatRecordSummary(passRecord.myAnyPass), formatPercentage(passRecord.myAnyPass.winRate))}
        ${breakdownCard("相手パス無", formatRecordSummary(passRecord.opponentNoPass), formatPercentage(passRecord.opponentNoPass.winRate))}
        ${breakdownCard("相手パス有", formatRecordSummary(passRecord.opponentAnyPass), formatPercentage(passRecord.opponentAnyPass.winRate))}
      </div>
    </section>

    <div class="analysis-toolbar">
      <h2 class="section-title tight-title">クロス集計</h2>
      ${selectedPivot === "colorMatrix"
        ? `<label class="analysis-pass-toggle analysis-sample-toggle"><input type="checkbox" data-analysis-minimum-color-samples ${minimumColorSamples ? "checked" : ""}><span>11戦以上のみ</span></label>`
        : `<select data-analysis-sort aria-label="並び替え">${optionTags([["total", "試合数順"], ["low", "勝率低い順"], ["high", "勝率高い順"]], selectedSort)}</select>`}
    </div>
    <div class="deck-tabs filter-tabs" aria-label="集計軸">
      ${analysisPivotOptions.map(([value, label]) => `
        <button class="${value === selectedPivot ? "active" : ""}" type="button" data-analysis-pivot="${value}">${label}</button>
      `).join("")}
    </div>
    ${selectedPivot === "colorMatrix"
      ? personalColorMatchupMarkup(colorMatchups, selectedColorMatchup, minimumColorSamples)
      : `<div class="matchup-list">
          ${rows.map((row) => `
            <button class="matchup-row" type="button" data-open-matchup="${escapeHtml(row.name)}">
              <div class="matchup-row-summary">
                <div>
                  <strong>${analysisRowName(row.name, selectedPivot)}</strong>
                  <span>${row.wins}勝 ${row.losses}敗 ${row.draws}分 / ${row.total}戦 ${sampleLabel(row.total)}</span>
                  <span>先 ${recordCompact(row.first)} / 後 ${recordCompact(row.second)}</span>
                </div>
                <div class="matchup-rate">
                  <b>${formatPercentage(row.winRate)}</b>
                  <div class="rps-track"><div class="progress-fill" style="width:${row.winRate}%"></div></div>
                </div>
              </div>
            </button>
          `).join("") || `<div class="empty-card">この条件に合う試合記録がありません</div>`}
        </div>`}
  `;
}

function analysisMatchesForCurrentRoute() {
  const {
    selectedRecordType,
    selectedDeckId,
    selectedVersion,
    selectedEnvironment,
    selectedStore,
    selectedMonth,
    excludePasses
  } = resolveAnalysisContext();
  let matches = analysisMatchesForDeck(
    selectedDeckId,
    selectedEnvironment,
    selectedStore,
    selectedVersion,
    selectedRecordType
  ).filter(isCompletedMatch);
  matches = filterMatchesByMonth(matches, selectedMonth);
  if (excludePasses) matches = filterMatchesWithoutPasses(matches);
  if (route.matchupPivot === "opponentPlayer") matches = matches.filter((match) => isKnownPlayerName(match.opponentPlayer));
  if (route.matchupPivot === "opponentColor") matches = matches.filter((match) => match.opponentColor);
  return matches;
}

function matchupDetailTitle(name, pivot) {
  if (pivot === "month") return formatMonth(name);
  return name || "未設定";
}

function passBadgesMarkup(match) {
  return passBadgeItems(match).map((badge) => `
    <span class="pass-badge ${badge.kind}">${escapeHtml(badge.label)}</span>
  `).join("");
}

function historyRecordCardMarkup(match, { primary, secondary, className = "" } = {}) {
  const tag = adminPreview ? "article" : "button";
  return `
    <${tag} class="match-history-card ${className}" ${adminPreview ? "" : `type="button" data-edit-match="${match.id}"`}>
      <span class="match-history-topline">
        <span class="match-history-primary">${primary}</span>
        <span class="match-history-status">${passBadgesMarkup(match)}<span class="history-result ${match.result}">${escapeHtml(resultLabels[match.result] || "未確定")}</span></span>
      </span>
      <span class="match-history-secondary">
        ${secondary.map((item, index) => `<span class="history-secondary-${index}">${escapeHtml(item)}</span>`).join("")}
      </span>
    </${tag}>
  `;
}

function matchupHistoryCardMarkup(match, pivot) {
  const player = normalizePlayerName(match.opponentPlayer);
  const opponentContext = pivot === "opponentDeck"
    ? player
    : `${player}・${match.opponentDeck || "デッキ未記録"}`;
  return historyRecordCardMarkup(match, {
    className: "matchup-history-card",
    primary: `<b>${escapeHtml(formatDate(match.date))}</b><span>${escapeHtml(opponentContext)}</span>`,
    secondary: [
      firstLabels[match.firstPlayer] || "先後未記録",
      `${match.myDeck || "デッキ未記録"} vs ${match.opponentDeck || "デッキ未記録"}`,
      match.opponentCaseCard || "事件未記録",
      match.store || "店舗未記録"
    ]
  });
}

function matchupSummaryButton(label, record, value, selected) {
  return `
    <button type="button" class="matchup-summary-button ${selected ? "active" : ""}" data-matchup-turn="${value}" aria-pressed="${selected}">
      <span>${label}</span>
      <strong>${formatPercentage(record.winRate)}</strong>
      <small>${formatRecordSummary(record)}</small>
    </button>
  `;
}

function renderMatchupDetail() {
  const pivot = drilldownPivots.has(route.matchupPivot) ? route.matchupPivot : "opponentDeck";
  const name = String(route.matchupName || "未設定");
  const result = ["win", "loss", "draw"].includes(route.matchupResult) ? route.matchupResult : "all";
  const turn = ["first", "second"].includes(route.matchupTurn) ? route.matchupTurn : "all";
  const allMatches = analysisMatchesForCurrentRoute();
  const groupMatches = filterMatchupRecords(allMatches, { pivot, name });
  const summary = summarizeMatches(groupMatches);
  const turnMatches = turn === "all" ? groupMatches : groupMatches.filter((match) => match.firstPlayer === turn);
  const visibleMatches = filterMatchupRecords(allMatches, { pivot, name, result, turn });
  const resultCounts = {
    all: turnMatches.length,
    win: turnMatches.filter((match) => match.result === "win").length,
    loss: turnMatches.filter((match) => match.result === "loss").length,
    draw: turnMatches.filter((match) => match.result === "draw").length
  };

  title.textContent = matchupDetailTitle(name, pivot);
  view.innerHTML = `
    <section class="matchup-detail-overview">
      <div class="matchup-summary-grid">
        ${matchupSummaryButton("総合", summary, "all", turn === "all")}
        ${matchupSummaryButton("先攻", summary.first, "first", turn === "first")}
        ${matchupSummaryButton("後攻", summary.second, "second", turn === "second")}
      </div>
      <div class="matchup-result-tabs" role="tablist" aria-label="勝敗で絞り込み">
        ${[
          ["all", "すべて"],
          ["win", "勝ち"],
          ["loss", "負け"],
          ...(summary.draws ? [["draw", "引分"]] : [])
        ].map(([value, label]) => `<button type="button" role="tab" data-matchup-result="${value}" aria-selected="${result === value}" class="${result === value ? "active" : ""}">${label}<b>${resultCounts[value]}</b></button>`).join("")}
      </div>
      ${pivot === "store" ? `<button class="matchup-store-link compact" type="button" data-open-store="${escapeHtml(name)}">店舗アーカイブを見る</button>` : ""}
    </section>
    <div class="matchup-history-heading"><strong>${visibleMatches.length}試合</strong><span>${turn === "all" ? "先後すべて" : firstLabels[turn]}・${resultFilterLabels[result]}</span></div>
    <div class="match-history-list">
      ${visibleMatches.map((match) => matchupHistoryCardMarkup(match, pivot)).join("") || `<div class="empty-card">この条件に合う対戦記録はありません</div>`}
    </div>
  `;
}

function renderRepair() {
  title.textContent = adminPreview ? `${adminPreview.username}・未記録` : "未記録を補完";
  const selectedField = qualityFields.some((field) => field.key === route.repairField)
    ? route.repairField
    : "";
  const queue = buildRepairQueue(state, selectedField);
  view.innerHTML = `
    ${adminPreview?.recovery?.active ? adminRecoverySupportMarkup(adminPreview.recovery) : ""}
    <section class="repair-filter">
      <label><span>項目</span><select data-repair-field>
        <option value="">すべての未記録</option>
        ${qualityFields.map((field) => `<option value="${field.key}" ${selectedField === field.key ? "selected" : ""}>${field.label}</option>`).join("")}
      </select></label>
      <strong>${queue.length}試合</strong>
    </section>
    <div class="repair-list">
      ${queue.map((item) => repairRowMarkup(item)).join("") || `
        <div class="empty-card">${selectedField ? `${escapeHtml(qualityFieldLabel(selectedField))}の未記録はありません` : "補完が必要な試合はありません"}</div>
      `}
    </div>
  `;
}

function repairRowMarkup(item) {
  const round = matchesForSession(item.session.id).findIndex((match) => match.id === item.match.id) + 1;
  const labels = item.missingFields.map(qualityFieldLabel);
  return `
    <${adminPreview ? "article" : "button"} class="repair-row" ${adminPreview ? "" : `type="button" data-repair-match="${item.match.id}"`}>
      <span>
        <strong>${escapeHtml(item.session.name || "大会名未設定")}</strong>
        <small>${formatDate(item.session.date)}・第${Math.max(round, 1)}試合・${escapeHtml(item.match.opponentDeck || "相手デッキ未記録")}</small>
      </span>
      <span class="repair-missing">${labels.slice(0, 2).map((label) => `<i>${escapeHtml(label)}</i>`).join("")}${labels.length > 2 ? `<b>+${labels.length - 2}</b>` : ""}</span>
      ${adminPreview ? "" : "<b>›</b>"}
    </${adminPreview ? "article" : "button"}>
  `;
}

function openRepairItem(item) {
  if (!item || adminPreview) return;
  const target = repairTargetForFields(item.missingFields, route.repairField || "");
  openDialog(target, target === "session" ? item.session.id : item.match.id);
}

function personalColorMatchupMarkup(rows, selected, minimumColorSamples) {
  const matchupMap = new Map(rows.map((row) => [`${row.myColor}:${row.opponentColor}`, row]));
  const selectedKey = selected ? `${selected.myColor}:${selected.opponentColor}` : "";
  return `
    <section class="admin-matchup-panel analysis-color-matchup-panel">
      <div class="admin-panel-head"><strong>自分色 × 相手色</strong><span>勝率 / 試合数</span></div>
      <div class="admin-matchup-matrix">
        <span></span>
        ${partnerColors.map((color) => `<span class="matrix-color-head" title="${color.label}"><i class="${color.id}"></i>${color.label}</span>`).join("")}
        ${partnerColors.map((myColor) => `
          <span class="matrix-color-head row-head" title="${myColor.label}"><i class="${myColor.id}"></i>${myColor.label}</span>
          ${partnerColors.map((opponentColor) => {
            const key = `${myColor.id}:${opponentColor.id}`;
            const row = matchupMap.get(key);
            return row
              ? `<button class="${selectedKey === key ? "selected" : ""} ${playerWinRateTone(row.winRate)} ${isSmallSample(row.total) ? "small-sample" : ""}" type="button" data-analysis-color-matchup="${key}" aria-label="${myColor.label}対${opponentColor.label} ${formatPercentage(row.winRate)} ${row.total}戦"><b>${formatPercentage(row.winRate)}</b><small>${row.total}</small></button>`
              : `<span class="empty-cell">−</span>`;
          }).join("")}
        `).join("")}
      </div>
    </section>
    ${selected
      ? personalColorMatchupDetail(selected)
      : `<p class="admin-empty-inline">${minimumColorSamples && !rows.length ? "11戦以上の色対面はまだありません" : "セルを選ぶと先後と事件カードの内訳を確認できます"}</p>`}
  `;
}

function personalColorMatchupDetail(row) {
  const caseCards = row.opponentCaseCards.filter((item) => item.name !== "未設定").slice(0, 8);
  return `
    <section class="admin-panel admin-matchup-detail analysis-color-matchup-detail">
      <div class="admin-panel-head"><strong>${escapeHtml(adminColorLabel(row.myColor))} × ${escapeHtml(adminColorLabel(row.opponentColor))}</strong><span>${formatRecordSummaryWithRate(row)}</span></div>
      <div class="admin-turn-split">
        <span><b>先攻 ${formatPercentage(row.first.winRate)}</b><small>${row.first.wins}-${row.first.losses}-${row.first.draws} / ${row.first.total}戦</small></span>
        <span><b>後攻 ${formatPercentage(row.second.winRate)}</b><small>${row.second.wins}-${row.second.losses}-${row.second.draws} / ${row.second.total}戦</small></span>
        ${row.unrecordedTurn.total ? `<span><b>先後未記録 ${row.unrecordedTurn.total}戦</b><small>${row.unrecordedTurn.wins}-${row.unrecordedTurn.losses}-${row.unrecordedTurn.draws}</small></span>` : ""}
      </div>
      <div class="admin-subsection compact analysis-case-list">
        <strong>相手事件カード</strong>
        ${caseCards.map(matchupCaseCardDetail).join("") || `<span><b>記録なし</b></span>`}
      </div>
    </section>
  `;
}

function matchupCaseCardDetail(item) {
  return `
    <details class="analysis-case-row">
      <summary><b>${escapeHtml(item.name)}</b><small>${formatRecordSummaryWithRate(item)}</small></summary>
      <div class="analysis-case-turns">
        <span>先攻 ${formatRecordSummaryWithRate(item.first)}</span>
        <span>後攻 ${formatRecordSummaryWithRate(item.second)}</span>
        ${item.unrecordedTurn.total ? `<span>先後未記録 ${formatRecordSummaryWithRate(item.unrecordedTurn)}</span>` : ""}
      </div>
    </details>
  `;
}

function renderPlayers() {
  title.textContent = "プレイヤー";
  const selected = route.playerName;
  const selectedPlayerRecordType = normalizeRecordType(route.playerRecordType, { allowAll: true });
  const recordTypeMatches = filterMatchesByRecordType(enrichMatches(state.matches), selectedPlayerRecordType);
  const months = analysisMonths(selectedPlayerRecordType);
  const selectedMonth = route.playerMonth && months.includes(route.playerMonth) ? route.playerMonth : "";
  const environments = uniqueValues(recordTypeMatches.map((match) => match.environment));
  const selectedEnvironment = route.playerEnvironment && environments.includes(route.playerEnvironment) ? route.playerEnvironment : "";
  const periodMatches = filterMatchesByEnvironment(filterMatchesByMonth(recordTypeMatches, selectedMonth), selectedEnvironment);

  if (selected) {
    title.textContent = selected;
    const record = getPlayerRecord(selected, periodMatches);
    const enriched = [...record.matches].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
    const rps = getRecordedRpsBreakdown(enriched);
    const latest = enriched[0];
    const pendingCount = enriched.length - record.total;
    const recordCountLabel = `${record.total ? `${record.total}戦` : ""}${pendingCount ? `${record.total ? "・" : ""}未確定${pendingCount}件` : ""}`;
    const deckRows = getPlayerDeckOverviews(enriched);
    view.innerHTML = `
      <div class="player-detail-period">
        <span>${selectedMonth ? formatMonth(selectedMonth) : "全期間"}・${escapeHtml(selectedEnvironment || "全環境")}・${escapeHtml(recordTypeLabel(selectedPlayerRecordType))}</span>
        <span class="player-detail-period-actions">
          <strong>${recordCountLabel}</strong>
          ${adminPreview ? "" : `<button type="button" data-rename-player="${escapeHtml(selected)}" aria-label="名前を変更" title="名前を変更">✎</button>`}
        </span>
      </div>
      <div class="record-type-tabs four player-record-type-tabs" role="tablist" aria-label="記録種別">
        ${[["challenge", "チャレンジ"], ["free", "フリー"], ["tuning", "調整"], ["all", "すべて"]].map(([value, label]) => `<button type="button" role="tab" data-player-record-type-tab="${value}" aria-selected="${selectedPlayerRecordType === value}" class="${selectedPlayerRecordType === value ? "active" : ""}">${label}</button>`).join("")}
      </div>
      ${record.total
        ? summaryCard(record, [`最終 ${formatDate(latest?.date)}`], true)
        : `<article class="player-pending-summary"><strong>勝敗未確定</strong><span>先後・じゃんけん・デッキ情報を確認できます</span></article>`}
      <section class="player-first-look">
        <div><strong>じゃんけん傾向</strong>${playerRpsMarkup(rps)}</div>
      </section>
      <h2 class="section-title">相手デッキ別</h2>
      <div class="player-deck-breakdown">${deckRows.map((row, index) => `
        <details class="player-deck-card">
          <summary>
            <strong>${playerColorDotMarkup(row.latestMatch?.opponentPartnerColor)}${escapeHtml(row.name)}${index === 0 ? `<em>最新</em>` : ""}</strong>
            <span>${row.total ? formatRecordSummaryWithRate(row) : "勝敗未確定"}</span>
          </summary>
          <div class="player-deck-meta">
            <span>最終 ${formatDate(row.latestMatch?.date)}</span>
            <span>色 ${escapeHtml(partnerColorLabel(row.latestMatch?.opponentPartnerColor))}</span>
            <span>事件 ${escapeHtml(row.latestMatch?.opponentCaseCard || "未記録")}</span>
          </div>
        </details>
      `).join("") || `<div class="player-deck-empty"><strong>記録なし</strong><span>期間または環境を変更してください</span></div>`}</div>
      <h2 class="section-title">${escapeHtml(selected)}との履歴</h2>
      <div class="match-history-list player-history-list">
        ${enriched.map((match) => {
          const session = getSession(match.sessionId);
          return historyRecordCardMarkup(match, {
            className: "player-match-history-card",
            primary: `<b>${escapeHtml(formatDate(session?.date))}</b><span>${escapeHtml(match.myDeck)} vs ${playerColorDotMarkup(match.opponentPartnerColor)}${escapeHtml(match.opponentDeck)}</span>`,
            secondary: [
              firstLabels[match.firstPlayer] || "先後未記録",
              match.opponentCaseCard || "事件未記録",
              selectedPlayerRecordType === "all"
                ? `${recordTypeLabel(match.recordType)}・${session?.name || "場所未記録"}`
                : session?.name || recordTypeLabel(match.recordType)
            ]
          });
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
    <div class="player-context-filters three">
      <label><span>期間</span><select data-player-month aria-label="期間"><option value="">全期間</option>${months.map((month) => `<option value="${month}" ${month === selectedMonth ? "selected" : ""}>${formatMonthOption(month)}</option>`).join("")}</select></label>
      <label><span>環境</span><select data-player-environment aria-label="環境"><option value="">全環境</option>${environments.map((environment) => `<option value="${escapeHtml(environment)}" ${environment === selectedEnvironment ? "selected" : ""}>${escapeHtml(environment)}</option>`).join("")}</select></label>
      <label><span>種別</span><select data-player-record-type aria-label="記録種別">${optionTags([["challenge", "チャレンジ"], ["free", "フリー"], ["tuning", "調整"], ["all", "すべて"]], selectedPlayerRecordType)}</select></label>
    </div>
    <div class="list-stack player-list" data-player-results>
      ${playerRowsMarkup(rows, query, Boolean(selectedMonth || selectedEnvironment || selectedPlayerRecordType !== "challenge"))}
    </div>
  `;
}

function playerRowsMarkup(rows, query, hasContextFilter) {
  return rows.map((row) => {
    const score = row.total
      ? `<span class="score-pill ${playerWinRateTone(row.winRate)}">${row.winRate}%<small>${row.wins}-${row.losses} / ${row.total}戦</small></span>`
      : `<span class="score-pill pending">未確定<small>結果待ち</small></span>`;
    return `
      <button class="player-list-card ${query ? "search-result" : ""}" type="button" data-open-player="${escapeHtml(row.name)}">
        <span class="player-list-copy">
          <strong>${escapeHtml(row.name)}</strong>
          <span>最終 ${formatDate(row.latestMatch?.date)}・<i class="player-latest-deck">${playerColorDotMarkup(row.latestMatch?.opponentPartnerColor)}${escapeHtml(row.latestMatch?.opponentDeck || "デッキ不明")}</i>・${escapeHtml(row.latestMatch?.store || "場所不明")}</span>
          ${query ? playerRpsMarkup(row.recordedRps, true) : ""}
        </span>
        ${score}
      </button>
    `;
  }).join("") || `<div class="empty-card">${query ? "該当するプレイヤーがいません" : hasContextFilter ? "この条件のプレイヤー記録はありません" : "試合記録に相手プレイヤー名を入れると、ここに履歴が出ます"}</div>`;
}

function playerColorDotMarkup(color) {
  const normalized = normalizePartnerColor(color);
  if (!normalized) return "";
  return `<i class="player-color-dot ${normalized}" aria-label="${escapeHtml(partnerColorLabel(normalized))}" title="${escapeHtml(partnerColorLabel(normalized))}"></i>`;
}

function analysisRowName(name, pivot) {
  if (pivot !== "opponentColor") return escapeHtml(name);
  const color = partnerColors.find((item) => item.label === name);
  return `<span class="analysis-color-name"><i class="${color?.id || "unrecorded"}"></i>${escapeHtml(name)}</span>`;
}

function playerRpsMarkup(rps, compact = false) {
  return `<div class="player-rps ${compact ? "quick" : ""}"><div class="rps-stack" aria-label="相手のじゃんけん傾向">${rps.rows.map((row) => `<span class="rps-segment ${row.key}" style="width:${row.percentage}%" title="${row.label} ${row.percentage}%"></span>`).join("")}</div><div class="player-rps-labels">${rps.rows.map((row) => `<span>${row.label} ${row.percentage}%</span>`).join("")}<span>${rps.total}戦</span></div></div>`;
}

function renderSessions() {
  title.textContent = "大会";
  const selectedView = route.view === "stores" ? "stores" : "sessions";
  const sessions = sortSessionsNewestFirst(filterSessionsByRecordType(state.sessions, "challenge"));
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
  const stores = uniqueValues(filterSessionsByRecordType(state.sessions, "challenge").map((session) => session.name)).map((name) => {
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

function renderAdmin() {
  title.textContent = "管理者";
  if (accountContext.role !== "superadmin") {
    view.innerHTML = `<div class="empty-card">この画面を表示する権限がありません</div>`;
    return;
  }
  if (adminState.loading) {
    view.innerHTML = `<div class="empty-card">集計データを読み込んでいます</div>`;
    return;
  }
  if (adminState.error) {
    view.innerHTML = `<div class="empty-card admin-error">${escapeHtml(adminState.error)}<button type="button" data-admin-reload>再読込</button></div>`;
    return;
  }
  if (!adminState.data) {
    view.innerHTML = `<div class="empty-card">管理データを読み込めませんでした</div>`;
    return;
  }

  const selectedTab = ["environment", "matchups", "usage", "quality", "users"].includes(route.adminTab)
    ? route.adminTab
    : "environment";
  const dashboard = buildAdminDashboard(adminState.raw, {
    month: selectedTab === "users" ? "" : route.adminMonth || "",
    environment: selectedTab === "users" ? "" : route.adminEnvironment || "",
    recordType: selectedTab === "users"
      ? "all"
      : normalizeRecordType(route.adminRecordType, { allowAll: true }),
    excludePasses: selectedTab === "users" ? false : Boolean(route.adminExcludePasses),
    consentedOnly: selectedTab === "users" ? false : Boolean(route.adminConsentedOnly)
  });
  const filterNote = selectedTab === "usage"
    ? "期間・環境は大会・試合に適用"
    : selectedTab === "quality"
      ? "選択条件を全記録に適用"
      : "勝率は完了試合のみ";
  view.innerHTML = `
    ${selectedTab === "users" ? "" : `<section class="admin-filter-bar with-record-type" aria-label="管理者集計フィルター">
      <label><span>期間</span><select data-admin-month><option value="">全期間</option>${dashboard.filterOptions.months.map((month) => `<option value="${month}" ${month === dashboard.filters.month ? "selected" : ""}>${formatMonth(month)}</option>`).join("")}</select></label>
      <label><span>環境</span><select data-admin-environment><option value="">全環境</option>${dashboard.filterOptions.environments.map((environment) => `<option value="${escapeHtml(environment)}" ${environment === dashboard.filters.environment ? "selected" : ""}>${escapeHtml(environment)}</option>`).join("")}</select></label>
      <label><span>種別</span><select data-admin-record-type>${optionTags([["challenge", "チャレンジ"], ["free", "フリー"], ["tuning", "調整"], ["all", "すべて"]], dashboard.filters.recordType)}</select></label>
      <div class="admin-filter-toggles">
        <label><input type="checkbox" data-admin-exclude-passes ${route.adminExcludePasses ? "checked" : ""}>パスを除く</label>
        <label><input type="checkbox" data-admin-consented-only ${route.adminConsentedOnly ? "checked" : ""}>同意者のみ</label>
        <span>${filterNote}</span>
      </div>
    </section>`}
    <nav class="admin-tabs" aria-label="管理者集計">
      ${adminTabButton("environment", "環境分析", selectedTab)}
      ${adminTabButton("matchups", "対面分析", selectedTab)}
      ${adminTabButton("usage", "利用状況", selectedTab)}
      ${adminTabButton("quality", "データ品質", selectedTab)}
      ${adminTabButton("users", "利用者", selectedTab)}
    </nav>
    ${selectedTab === "environment" ? adminEnvironmentMarkup(dashboard) : ""}
    ${selectedTab === "matchups" ? adminMatchupMarkup(dashboard) : ""}
    ${selectedTab === "usage" ? adminUsageMarkup(dashboard) : ""}
    ${selectedTab === "quality" ? adminQualityMarkup(dashboard) : ""}
    ${selectedTab === "users" ? adminUsersMarkup(dashboard) : ""}
  `;
}

function adminMetric(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function adminTabButton(id, label, selectedTab) {
  return `<button class="${selectedTab === id ? "active" : ""}" type="button" data-admin-tab="${id}">${label}</button>`;
}

function adminEnvironmentMarkup(dashboard) {
  const ownColorRecorded = dashboard.environment.myColors
    .filter((row) => row.name !== "unrecorded")
    .reduce((sum, row) => sum + row.total, 0);
  const opponentCaseRecorded = dashboard.environment.opponentCaseCards
    .filter((row) => row.name !== "unrecorded")
    .reduce((sum, row) => sum + row.total, 0);
  return `
    <section class="admin-metrics" aria-label="環境集計概要">
      ${adminMetric("利用者", dashboard.summary.users)}
      ${adminMetric("大会", dashboard.summary.sessions)}
      ${adminMetric("完了試合", dashboard.summary.matches)}
      ${adminMetric("勝率", `${dashboard.summary.winRate}%`)}
      ${adminMetric("色記録", `${dashboard.summary.matches ? Math.round((ownColorRecorded / dashboard.summary.matches) * 100) : 0}%`)}
      ${adminMetric("事件記録", `${dashboard.summary.matches ? Math.round((opponentCaseRecorded / dashboard.summary.matches) * 100) : 0}%`)}
    </section>
    ${adminColorShare("利用者の使用色", dashboard.environment.myColors, true)}
    ${adminColorShare("対戦相手の色", dashboard.environment.opponentColors)}
    <section class="admin-ranking-grid">
      ${adminRanking("使用事件カード", dashboard.environment.myCaseCards, adminCaseCardLabel)}
      ${adminRanking("相手事件カード", dashboard.environment.opponentCaseCards, adminCaseCardLabel)}
      ${adminRanking("使用デッキ", dashboard.environment.myDecks)}
      ${adminRanking("相手デッキ", dashboard.environment.opponentDecks)}
    </section>
    ${adminColorTrendMarkup(dashboard.environment.colorTrends)}
    <details class="admin-disclosure">
      <summary>環境・大会結果・店舗</summary>
      ${adminEnvironmentRows(dashboard.environment.environments)}
      ${adminPlacementRows(dashboard.environment.placements, dashboard.environment.randomPrizes)}
      ${adminStoreRows(dashboard.stores)}
    </details>
  `;
}

function adminColorShare(label, rows, open = false) {
  const recorded = rows.filter((row) => partnerColors.some((color) => color.id === row.name));
  const total = recorded.reduce((sum, row) => sum + row.total, 0);
  return `
    <details class="admin-share-card" ${open ? "open" : ""}>
      <summary><strong>${label}</strong><span>${total}戦</span></summary>
      ${total ? `
        <div class="admin-color-stack" aria-label="${label}">${recorded.map((row) => `<span class="${row.name}" style="width:${(row.total / total) * 100}%" title="${adminColorLabel(row.name)} ${row.total}戦"></span>`).join("")}</div>
        <div class="admin-color-legend">${partnerColors.map((color) => {
          const row = recorded.find((item) => item.name === color.id);
          return `<span><i class="${color.id}"></i>${color.label}<b>${row?.total || 0}</b><small>${row ? Math.round((row.total / total) * 100) : 0}%</small></span>`;
        }).join("")}</div>
      ` : `<p class="admin-empty-inline">色の記録がありません</p>`}
    </details>
  `;
}

function adminRanking(label, rows, nameOf = (value) => value) {
  const recorded = rows.filter((row) => row.name !== "unrecorded").slice(0, 6);
  return `
    <div class="admin-ranking">
      <strong>${label}</strong>
      ${recorded.map((row) => `<span><b>${escapeHtml(nameOf(row.name))}</b><small>${row.total}戦・${row.winRate}%</small></span>`).join("") || `<span><b>記録なし</b></span>`}
    </div>
  `;
}

function adminColorTrendMarkup(trend) {
  const rows = trend.rows.filter((row) => row.name !== "unrecorded").slice(0, 6);
  if (!rows.length) return "";
  return `
    <section class="admin-panel">
      <div class="admin-panel-head"><strong>使用色の前月差</strong><span>${formatMonth(trend.previousMonth)} → ${formatMonth(trend.currentMonth)}</span></div>
      <div class="admin-trend-list">${rows.map((row) => `<span><b><i class="admin-color-dot ${row.name}"></i>${escapeHtml(adminColorLabel(row.name))}</b><small>${row.previous} → ${row.current}</small><strong class="${row.delta > 0 ? "up" : row.delta < 0 ? "down" : ""}">${row.delta > 0 ? "+" : ""}${row.delta}</strong></span>`).join("")}</div>
    </section>
  `;
}

function adminEnvironmentRows(rows) {
  return `<div class="admin-subsection"><strong>環境別</strong>${rows.map((row) => `<span><b>${escapeHtml(row.name)}</b><small>${row.users}人・${row.sessions}大会・${row.matches}戦</small></span>`).join("") || `<span><b>記録なし</b></span>`}</div>`;
}

function adminPlacementRows(rows, randomPrizes) {
  return `<div class="admin-subsection"><strong>大会結果</strong>${rows.map((row) => `<span><b>${escapeHtml(adminPlacementLabel(row.name))}</b><small>${row.total}大会</small></span>`).join("") || `<span><b>記録なし</b></span>`}<span><b>ランダム賞</b><small>${randomPrizes}大会</small></span></div>`;
}

function adminStoreRows(rows) {
  return `<div class="admin-subsection"><strong>店舗</strong>${rows.slice(0, 8).map((row) => `<span><b>${escapeHtml(row.name)}</b><small>${row.users}人・${row.sessions}大会・${row.matches}戦</small></span>`).join("") || `<span><b>記録なし</b></span>`}</div>`;
}

function adminMatchupMarkup(dashboard) {
  const minimumSamples = Boolean(route.adminMinimumColorSamples);
  const matchupRows = filterAdminMatchups(dashboard.matchups, minimumSamples);
  const matchupMap = new Map(matchupRows.map((row) => [`${row.myColor}:${row.opponentColor}`, row]));
  const selectedKey = matchupMap.has(route.adminMatchup) ? route.adminMatchup : "";
  const selected = matchupMap.get(selectedKey);
  return `
    <section class="admin-metrics admin-matchup-metrics" aria-label="対面集計概要">
      ${adminMetric("完了試合", dashboard.summary.matches)}
      ${adminMetric("色対面記録", dashboard.matchups.reduce((sum, row) => sum + row.total, 0))}
      ${adminMetric("全体勝率", `${dashboard.summary.winRate}%`)}
    </section>
    <section class="admin-matchup-panel">
      <div class="admin-panel-head">
        <strong>自分色 × 相手色</strong>
        <label class="admin-sample-toggle">
          <input type="checkbox" data-admin-minimum-color-samples ${minimumSamples ? "checked" : ""}>
          <span>11戦以上のみ</span>
        </label>
      </div>
      <div class="admin-matchup-matrix">
        <span></span>
        ${partnerColors.map((color) => `<span class="matrix-color-head" title="${color.label}"><i class="${color.id}"></i>${color.label}</span>`).join("")}
        ${partnerColors.map((myColor) => `
          <span class="matrix-color-head row-head" title="${myColor.label}"><i class="${myColor.id}"></i>${myColor.label}</span>
          ${partnerColors.map((opponentColor) => {
            const key = `${myColor.id}:${opponentColor.id}`;
            const row = matchupMap.get(key);
            return row
              ? `<button class="${selectedKey === key ? "selected" : ""} ${playerWinRateTone(row.winRate)} ${isSmallSample(row.total) ? "small-sample" : ""}" type="button" data-admin-matchup="${key}" aria-label="${myColor.label}対${opponentColor.label} ${row.winRate}% ${row.total}戦"><b>${row.winRate}%</b><small>${row.total}</small></button>`
              : `<span class="empty-cell">−</span>`;
          }).join("")}
        `).join("")}
      </div>
    </section>
    ${selected
      ? adminMatchupDetail(selected)
      : `<p class="admin-empty-inline">${minimumSamples && !matchupRows.length
        ? "11戦以上の色対面はまだありません"
        : "セルを選ぶと先後と事件カードの内訳を確認できます"}</p>`}
  `;
}

function adminMatchupDetail(row) {
  const caseCards = row.opponentCaseCards.filter((item) => item.name !== "unrecorded").slice(0, 8);
  return `
    <section class="admin-panel admin-matchup-detail">
      <div class="admin-panel-head"><strong>${escapeHtml(adminColorLabel(row.myColor))} × ${escapeHtml(adminColorLabel(row.opponentColor))}</strong><span>${formatRecordSummaryWithRate(row)}</span></div>
      <div class="admin-turn-split">
        <span><b>先攻 ${formatPercentage(row.first.winRate)}</b><small>${row.first.wins}-${row.first.losses}-${row.first.draws} / ${row.first.total}戦</small></span>
        <span><b>後攻 ${formatPercentage(row.second.winRate)}</b><small>${row.second.wins}-${row.second.losses}-${row.second.draws} / ${row.second.total}戦</small></span>
        ${row.unrecordedTurn.total ? `<span><b>先後未記録 ${row.unrecordedTurn.total}戦</b><small>${row.unrecordedTurn.wins}-${row.unrecordedTurn.losses}-${row.unrecordedTurn.draws}</small></span>` : ""}
      </div>
      <div class="admin-subsection compact analysis-case-list">
        <strong>相手事件カード</strong>
        ${caseCards
          .map((item) => matchupCaseCardDetail({ ...item, name: adminCaseCardLabel(item.name) }))
          .join("") || `<span><b>記録なし</b></span>`}
      </div>
    </section>
  `;
}

function adminUsageMarkup(dashboard) {
  const usage = dashboard.usage;
  return `
    <section class="admin-metrics" aria-label="利用状況">
      ${adminMetric("登録者", usage.registeredUsers)}
      ${adminMetric("初試合済", usage.activatedUsers)}
      ${adminMetric("7日同期", usage.activeUsers7d)}
      ${adminMetric("30日同期", usage.activeUsers30d)}
      ${adminMetric("30日未同期", usage.inactiveUsers30d)}
      ${adminMetric("平均試合", usage.averageMatchesPerUser)}
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head"><strong>月別利用</strong><span>利用者 / 大会 / 試合</span></div>
      <div class="admin-activity-list">${usage.activityByMonth.slice(0, 12).map((row) => `<span><b>${formatMonth(row.month)}</b><small>${row.users}人</small><small>${row.sessions}大会</small><strong>${row.matches}戦</strong></span>`).join("") || `<p class="admin-empty-inline">利用記録がありません</p>`}</div>
    </section>
    <div class="admin-quality-note"><strong>同期日の定義</strong><span>7日・30日はクラウドデータの最終同期日時を基準にしています。</span></div>
  `;
}

function adminUsersMarkup(dashboard) {
  const filters = {
    query: route.adminUserQuery || "",
    status: ["all", "attention", "recovery", "stale", "empty"].includes(route.adminUserStatus) ? route.adminUserStatus : "all",
    sort: ["attention", "latest", "matches", "sessions", "winRate"].includes(route.adminUserSort) ? route.adminUserSort : "attention",
    direction: route.adminUserDirection === "asc" ? "asc" : "desc"
  };
  const rows = filterAdminUsers(dashboard.userRows, filters);
  return `
    <section class="admin-user-toolbar">
      <label class="admin-user-search"><span>検索</span><input value="${escapeHtml(filters.query)}" placeholder="ユーザー名" autocomplete="off" data-admin-user-search></label>
      <label><span>状態</span><select data-admin-user-status>${optionTags([
        ["all", "すべて"],
        ["attention", "要対応"],
        ["recovery", "引き継ぎ"],
        ["stale", "長期未同期"],
        ["empty", "記録なし"]
      ], filters.status)}</select></label>
      <label><span>並び</span><select data-admin-user-sort>${optionTags([
        ["attention", "要対応"],
        ["latest", "最終同期"],
        ["matches", "試合数"],
        ["sessions", "大会数"],
        ["winRate", "勝率"]
      ], filters.sort)}</select></label>
      <button type="button" data-admin-user-direction aria-label="昇順と降順を切り替え">${filters.direction === "asc" ? "↑" : "↓"}</button>
      <small data-admin-user-count>${rows.length}人</small>
    </section>
    <div class="admin-heading"><h2>利用者</h2><button type="button" data-copy-ai-dataset>匿名AIデータをコピー</button></div>
    ${adminUserRows(rows)}
  `;
}

function adminUserRows(rows) {
  return `
    <div class="admin-user-list" data-admin-user-results>
      ${rows.map((row) => `
        <button class="admin-user-row" type="button" data-open-admin-user="${row.userId}" ${adminState.previewLoadingUserId ? "disabled" : ""}>
          <div><strong>${escapeHtml(row.username)}</strong><span>最終 ${formatAdminDate(row.lastUpdated)}・${row.decks}デッキ・${row.sessions}大会</span>${adminUserStatusChips(row)}</div>
          <div><strong>${row.winRate}%</strong><span>${row.wins}-${row.losses}-${row.draws} / ${row.matches}戦</span></div>
          <i class="${row.consented ? "accepted" : ""}">${adminState.previewLoadingUserId === row.userId ? "読込中" : row.consented ? "同意済" : "未同意"}</i>
        </button>
      `).join("") || `<div class="empty-card">この条件の利用者データがありません</div>`}
    </div>
  `;
}

function updateAdminUserSearchResults(search) {
  route = { ...route, name: "admin", adminTab: "users", adminUserQuery: search.value };
  const dashboard = buildAdminDashboard(adminState.raw || {}, {
    month: "",
    environment: "",
    recordType: "all",
    excludePasses: false,
    consentedOnly: false
  });
  const rows = filterAdminUsers(dashboard.userRows, {
    query: search.value,
    status: route.adminUserStatus || "all",
    sort: route.adminUserSort || "attention",
    direction: route.adminUserDirection === "asc" ? "asc" : "desc"
  });
  const results = view.querySelector("[data-admin-user-results]");
  const count = view.querySelector("[data-admin-user-count]");
  if (results) results.outerHTML = adminUserRows(rows);
  if (count) count.textContent = `${rows.length}人`;
}

function adminUserStatusChips(row) {
  const chips = [];
  if (row.recovery?.active) chips.push(`<b class="support-chip recovery">引き継ぎ ${row.recovery.matches}試合</b>`);
  if (row.stale) chips.push(`<b class="support-chip stale">長期未同期</b>`);
  if (row.empty) chips.push(`<b class="support-chip empty">記録なし</b>`);
  return chips.length ? `<span class="support-chip-row">${chips.join("")}</span>` : "";
}

function adminQualityMarkup(dashboard) {
  const quality = dashboard.quality;
  const selected = quality.fields.find((row) => row.key === route.adminQualityField);
  return `
    <section class="admin-metrics" aria-label="データ品質">
      ${adminMetric("全記録", quality.totalRecords)}
      ${adminMetric("完了", quality.completedMatches)}
      ${adminMetric("未確定", quality.pendingMatches)}
      ${adminMetric("同意者", quality.aiEligibleUsers)}
      ${adminMetric("AI対象", quality.aiEligibleMatches)}
      ${adminMetric("30日未同期", quality.staleUsers30d)}
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head"><strong>項目別の記録率</strong><span>記録済み / 全記録</span></div>
      <div class="admin-quality-list">${quality.fields.map((row) => `
        <button type="button" class="${selected?.key === row.key ? "selected" : ""}" data-admin-quality-field="${row.key}">
          <span><b>${escapeHtml(row.label)}</b><small>${row.recorded}/${quality.totalRecords}・未記録 ${row.missing}</small><strong>${row.rate}%</strong></span>
          <div><i style="width:${row.rate}%"></i></div>
        </button>
      `).join("")}</div>
    </section>
    ${selected ? adminQualityUsersMarkup(selected, dashboard.userRows) : ""}
    <div class="admin-quality-note">
      <strong>集計の読み方</strong>
      <span>未確定は勝率・対面分析から除外されています。記録率が低い項目ほど、分析結果の偏りに注意が必要です。</span>
    </div>
  `;
}

function adminQualityUsersMarkup(field, users) {
  const usersById = new Map(users.map((user) => [user.userId, user]));
  return `
    <section class="admin-panel admin-quality-users">
      <div class="admin-panel-head"><strong>${escapeHtml(field.label)}の未記録</strong><span>${field.missing}試合</span></div>
      <div class="admin-subsection compact">
        ${field.affectedUsers.map((item) => {
          const user = usersById.get(item.userId);
          return `
            <button type="button" data-admin-quality-user="${item.userId}" data-quality-field="${field.key}">
              <b>${escapeHtml(user?.username || "未設定")}</b><small>${item.missing}試合</small><i>›</i>
            </button>
          `;
        }).join("") || `<span><b>対象なし</b></span>`}
      </div>
    </section>
  `;
}

function adminRecoverySupportMarkup(recovery) {
  return `
    <section class="admin-recovery-support">
      <strong>端末データの引き継ぎが完了していません</strong>
      <span>${recovery.decks}デッキ・${recovery.sessions}大会・${recovery.matches}試合</span>
      ${recovery.ambiguous ? `<small>重複候補 ${recovery.ambiguous}件</small>` : ""}
      <small>本人の端末で確認が必要です</small>
    </section>
  `;
}

function adminColorLabel(id) {
  return partnerColors.find((color) => color.id === id)?.label || "未記録";
}

function adminCaseCardLabel(id) {
  if (!id || id === "unrecorded") return "未記録";
  return getCaseCard(id)?.name || id;
}

function adminPlacementLabel(value) {
  if (value === "unrecorded") return "未記録";
  return placementLabels[value] || value;
}

function formatAdminDate(value) {
  if (!value) return "未記録";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function render() {
  updateSuggestions();
  renderSyncStatus();
  const currentDeck = route.name === "deckDetail" ? getDeck(route.deckId) : null;
  const hasBackButton = Boolean(adminPreview) || ["deckDetail", "session", "playerDetail", "storeDetail", "matchupDetail", "admin", "recovery", "repair"].includes(route.name);
  view.classList.toggle("player-index-screen", route.name === "players");
  phoneShell.classList.toggle("admin-preview-mode", Boolean(adminPreview));
  topBar.classList.toggle("root-header", !hasBackButton);
  backButton.style.visibility = hasBackButton ? "visible" : "hidden";
  fabButton.hidden = Boolean(adminPreview) || ["summary", "players", "playerDetail", "storeDetail", "matchupDetail", "admin", "recovery", "repair"].includes(route.name) || (route.name === "sessions" && route.view === "stores") || Boolean(currentDeck?.archived);
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.nav === rootNavName()));

  if (route.name === "decks") renderDecks();
  if (route.name === "deckDetail") renderDeckDetail(route.deckId);
  if (route.name === "session") renderSession(route.sessionId);
  if (route.name === "summary") renderSummary();
  if (route.name === "matchupDetail") renderMatchupDetail();
  if (route.name === "players" || route.name === "playerDetail") renderPlayers();
  if (route.name === "sessions") renderSessions();
  if (route.name === "storeDetail") renderStoreDetail(route.storeName);
  if (route.name === "admin") renderAdmin();
  if (route.name === "recovery") renderRecovery();
  if (route.name === "repair") renderRepair();
  if (route.name !== "recovery") view.insertAdjacentHTML("afterbegin", recoveryNoticeMarkup());
  if (adminPreview?.recovery?.active && route.name !== "repair") {
    view.insertAdjacentHTML("afterbegin", adminRecoverySupportMarkup(adminPreview.recovery));
  }
}

function rootNavName() {
  if (route.name === "deckDetail") return "decks";
  if (route.name === "session") return "sessions";
  if (route.name === "playerDetail") return "players";
  if (route.name === "storeDetail") return "sessions";
  if (route.name === "repair") return "summary";
  if (route.name === "matchupDetail") return "summary";
  if (route.name === "recovery") return "decks";
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
    recordType: normalizeRecordType(route.recordType, { allowAll: true }),
    pivot: route.pivot || "opponentDeck",
    sort: route.sort || "total",
    excludePasses: Boolean(route.excludePasses),
    minimumColorSamples: Boolean(route.minimumColorSamples),
    colorMatchup: route.colorMatchup || "",
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
      ${partnerColorChoices("partnerColor", "", "deck")}
      ${caseCardPicker({ inputName: "caseCardName", scope: "deck" })}
    `;
  }

  if (mode === "playerRename") {
    dialogKicker.textContent = "Player";
    dialogTitle.textContent = "プレイヤー名を変更";
    dialogSubmit.textContent = "変更";
    const currentName = targetId || route.playerName || "";
    dialogFields.innerHTML = `
      <input type="hidden" name="currentPlayerName" value="${escapeHtml(currentName)}">
      ${playerNameFieldMarkup({ name: "playerName", label: "新しい名前", value: currentName, id: "renamePlayerName" })}
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
    dialogKicker.textContent = cloudStatus.signedIn ? "Cloud" : "Account";
    dialogTitle.textContent = cloudStatus.signedIn ? "クラウド同期" : "ユーザー登録・ログイン";
    dialogSubmit.hidden = true;
    const backToMenu = accountOnboardingActive ? "" : `<button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>`;
    dialogFields.innerHTML = `${backToMenu}${cloudMenuMarkup()}`;
  }

  if (mode === "dataSettings") {
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "環境・データ管理";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `<button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>${dataSettingsMarkup()}`;
  }

  if (mode === "releaseNotes") {
    const release = releaseForVersion(releaseManifest, targetId) || availableRelease || latestRelease(releaseManifest);
    dialogKicker.textContent = "Update";
    dialogTitle.textContent = release?.title || "更新内容";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = releaseDetailsMarkup(release);
  }

  if (mode === "releaseHistory") {
    dialogKicker.textContent = "Update";
    dialogTitle.textContent = "更新履歴";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `
      <button class="sheet-back-button" type="button" data-open-menu-panel="menu">‹ メニュー</button>
      ${releaseHistoryMarkup(releaseManifest)}
    `;
  }

  if (mode === "playerNameTrimPreview") {
    dialogKicker.textContent = "Data";
    dialogTitle.textContent = "変更内容を確認";
    dialogSubmit.hidden = true;
    dialogFields.innerHTML = `
      <button class="sheet-back-button" type="button" data-open-menu-panel="dataSettings">‹ データ管理</button>
      ${playerNameTrimPreviewMarkup(previewPlayerNameHonorificTrim(state))}
    `;
  }

  if (mode === "session") {
    dialogSubmit.hidden = false;
    dialogKicker.textContent = "Session";
    const editingSession = editingSessionId ? getSession(editingSessionId) : null;
    dialogTitle.textContent = editingSession ? "セッション編集" : "セッション登録";
    dialogSubmit.textContent = editingSession ? "更新" : "保存";
    const activeDecks = filterDecksByArchived(state.decks);
    const editableDecks = editingSession
      ? uniqueById([...activeDecks, getDeck(editingSession.deckId)].filter(Boolean))
      : activeDecks;
    const deckId = route.deckId || activeDecks[0]?.id || "";
    const fixedDeck = !editingSession && route.name === "deckDetail" ? getDeck(route.deckId) : null;
    const selectedSessionDeckId = editingSession?.deckId || deckId;
    const selectedSessionDeck = getDeck(selectedSessionDeckId);
    const selectedSessionVersion = editingSession?.deckVersion || getDeck(selectedSessionDeckId)?.version || "v1";
    const sessionVersions = sessionVersionOptions(state, selectedSessionDeckId, selectedSessionVersion);
    const selectedSessionPartnerColor = editingSession?.partnerColor || selectedSessionDeck?.partnerColor || "";
    const selectedSessionCaseCardId = editingSession?.caseCardId || selectedSessionDeck?.caseCardId || "";
    const selectedSessionRecordType = normalizeRecordType(editingSession?.recordType || route.recordType);
    dialogFields.innerHTML = `
      <fieldset class="session-record-type-field">
        <legend>記録種別</legend>
        <div class="session-record-type-options">
          ${[
            ["challenge", "チャレンジ"],
            ["free", "フリー"],
            ["tuning", "調整"]
          ].map(([value, label]) => `<label><input type="radio" name="recordType" value="${value}" data-session-record-type ${value === selectedSessionRecordType ? "checked" : ""}><span>${label}</span></label>`).join("")}
        </div>
      </fieldset>
      ${fixedDeck ? `
        <div class="locked-field">
          <span>使用デッキ</span>
          <strong>${escapeHtml(fixedDeck.name)}</strong>
          <small>${escapeHtml(editingSession?.deckVersion || fixedDeck.version || "v1")}</small>
          <input type="hidden" name="deckId" value="${fixedDeck.id}">
        </div>
      ` : `
        <label>使用デッキ<select name="deckId" data-session-deck-select required>${editableDecks.map((deck) => `<option value="${deck.id}" ${deck.id === selectedSessionDeckId ? "selected" : ""}>${escapeHtml(deck.name)}</option>`).join("")}</select></label>
      `}
      ${editingSession ? `<label>使用時のバージョン<select name="deckVersion" data-session-version-select required>${optionTags(sessionVersions.map((version) => [version, version]), selectedSessionVersion)}</select></label>` : ""}
      <label data-session-name-field><span data-session-name-label>大会名/店舗名</span><input name="name" list="sessionNameSuggestions" required placeholder="例: 秋葉原チェルモ" value="${escapeHtml(editingSession?.name || "")}"></label>
      ${sessionEnvironmentField(editingSession)}
      <div class="inline-fields">
        <label>日付<input type="date" name="date" required value="${editingSession?.date || new Date().toISOString().slice(0, 10)}"></label>
        <label>形式<select name="format">${optionTags([["BO1", "BO1"], ["BO3", "BO3"]], editingSession?.format || "BO1")}</select></label>
      </div>
      <details class="session-related-link-fields" ${editingSession?.relatedUrl ? "open" : ""}>
        <summary>関連リンク</summary>
        <label>関連URL（任意）
          <input type="text" inputmode="url" autocomplete="url" name="relatedUrl" placeholder="https://..." value="${escapeHtml(editingSession?.relatedUrl || "")}" aria-describedby="sessionRelatedUrlError">
          <span class="field-error" id="sessionRelatedUrlError" data-related-url-error role="alert" hidden></span>
        </label>
        <p class="form-note">トナメルや共有対戦表など、あとで開きたいページを1件保存できます。</p>
      </details>
      ${editingSession ? `
        <details class="match-extra-fields" ${route.name === "repair" ? "open" : ""}>
          <summary>使用時の色・事件カード</summary>
          ${partnerColorChoices("sessionPartnerColor", selectedSessionPartnerColor, "session")}
          ${caseCardPicker({
            inputName: "sessionCaseCardName",
            selectedCaseCardId: selectedSessionCaseCardId,
            partnerColor: selectedSessionPartnerColor,
            scope: "session"
          })}
        </details>
      ` : ""}
      <details class="session-result-fields" data-challenge-session-field ${editingSession?.placement || editingSession?.randomPrizeMethod ? "open" : ""}>
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
    const editingMatch = editingMatchId ? state.matches.find((match) => match.id === editingMatchId) : null;
    dialogSubmit.hidden = false;
    const session = getSession(editingMatch?.sessionId || route.sessionId) || state.sessions[0];
    const deck = getDeck(session?.deckId);
    dialogKicker.textContent = "Round";
    dialogTitle.textContent = editingMatch ? "勝敗を編集" : "勝敗登録";
    dialogSubmit.textContent = editingMatch ? "更新" : "保存";
    const selectedResult = matchResultSelection(editingMatch);
    dialogFields.innerHTML = `
      <input type="hidden" name="myDeck" value="${escapeHtml(editingMatch?.myDeck || deck?.name || "")}">
      <div class="round-played-field" data-played-round-field>
        ${playerNameFieldMarkup({ name: "opponentPlayer", label: "プレイヤー名", value: normalizePlayerName(editingMatch?.opponentPlayer), id: "matchOpponentPlayer" })}
      </div>
      <div class="inline-fields">
        <label>勝敗<select name="result" data-round-result-select>${optionTags([["pending", "未確定"], ["win", "Win"], ["loss", "Lose"], ["draw", "Draw"], ["bye", "不戦勝"]], selectedResult)}</select></label>
        <label data-played-round-field>先/後<select name="firstPlayer" required>${requiredOptionTags([["first", "先攻"], ["second", "後攻"]], editingMatch?.firstPlayer || "", "選択")}</select></label>
      </div>
      <p class="bye-round-note" data-bye-round-note hidden>セッション戦績には1勝として反映し、対戦分析には含まれません</p>
      <details class="match-extra-fields" data-played-round-field ${editingMatch ? "open" : ""}>
        <summary>色・事件カード・その他</summary>
        ${partnerColorChoices("opponentPartnerColor", editingMatch?.opponentPartnerColor || "", "opponent")}
        ${caseCardPicker({
          inputName: "opponentCaseCardName",
          selectedCaseCardId: editingMatch?.opponentCaseCardId || "",
          partnerColor: editingMatch?.opponentPartnerColor || "",
          scope: "opponent"
        })}
        <label>デッキ名<input name="opponentDeck" list="opponentDeckSuggestions" placeholder="例: 婚活警視庁" value="${escapeHtml(editingMatch?.opponentDeck === "不明" ? "" : editingMatch?.opponentDeck || "")}"></label>
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
  if (dialogMode === "session") syncSessionRecordTypeFields();
  if (dialogMode === "match") syncRoundFormFields();
  if (!dialog.open) dialog.showModal();
}

function syncSessionRecordTypeFields() {
  const selected = dialogFields.querySelector("[data-session-record-type]:checked");
  if (!selected) return;
  const recordType = normalizeRecordType(selected.value);
  dialogFields.querySelectorAll("[data-challenge-session-field]").forEach((field) => {
    field.hidden = recordType !== "challenge";
  });
  const nameInput = entryForm.elements.name;
  const nameLabel = dialogFields.querySelector("[data-session-name-label]");
  if (nameInput) {
    nameInput.required = recordType === "challenge";
    nameInput.placeholder = recordType === "challenge" ? "例: 秋葉原チェルモ" : "店舗名・対戦会名（任意）";
  }
  if (nameLabel) nameLabel.textContent = recordType === "challenge" ? "大会名/店舗名" : "場所・セッション名（任意）";
}

function syncRoundFormFields() {
  const resultSelect = entryForm.elements.result;
  if (!resultSelect) return;
  const formState = roundFormState(resultSelect.value);
  dialogFields.querySelectorAll("[data-played-round-field]").forEach((field) => {
    field.hidden = formState.isBye;
  });
  const playerInput = entryForm.elements.opponentPlayer;
  const turnSelect = entryForm.elements.firstPlayer;
  if (playerInput) playerInput.required = !formState.isBye;
  if (turnSelect) turnSelect.required = formState.requiresTurn;
  const note = dialogFields.querySelector("[data-bye-round-note]");
  if (note) note.hidden = !formState.isBye;
}

function showSessionRelatedUrlError(message = "") {
  const input = entryForm.elements.relatedUrl;
  const error = dialogFields.querySelector("[data-related-url-error]");
  if (!input || !error) return;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  error.textContent = message;
  error.hidden = !message;
  if (message) {
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function releaseDialogFocus() {
  const focusedElement = document.activeElement;
  if (focusedElement instanceof HTMLElement && dialog.contains(focusedElement)) {
    focusedElement.blur();
  }
}

entryForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") {
    releaseDialogFocus();
    return;
  }
  event.preventDefault();
  if (adminPreview) return;
  const data = new FormData(entryForm);
  const repairContext = route.name === "repair" && ["match", "session"].includes(dialogMode)
    ? {
        matchId: editingMatchId,
        sessionId: editingSessionId,
        field: route.repairField || "",
        route: { ...route }
      }
    : null;

  if (dialogMode === "deck") {
    const now = new Date().toISOString();
    const partnerColor = normalizePartnerColor(data.get("partnerColor"));
    const caseCardId = selectedCaseCardId("caseCardName", partnerColor);
    if (caseCardId === null) return;
    const deck = {
      id: crypto.randomUUID(),
      name: data.get("name").trim(),
      version: data.get("version").trim() || "v1",
      color: "purple",
      partnerColor,
      caseCardId,
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
    const relatedUrlError = sessionRelatedUrlValidationMessage(data.get("relatedUrl"));
    if (relatedUrlError) {
      showSessionRelatedUrlError(relatedUrlError);
      return;
    }
    const selectedDeck = getDeck(data.get("deckId"));
    const currentSession = editingSessionId ? getSession(editingSessionId) : null;
    const keepsDeckMetadata = currentSession?.deckId === data.get("deckId");
    const sessionPartnerColor = currentSession
      ? normalizePartnerColor(data.get("sessionPartnerColor"))
      : selectedDeck?.partnerColor || "";
    const sessionCaseCardId = currentSession
      ? selectedCaseCardId("sessionCaseCardName", sessionPartnerColor)
      : selectedDeck?.caseCardId || "";
    if (sessionCaseCardId === null) return;
    const randomPrizeMethod = data.get("randomPrizeMethod") || "";
    const session = sanitizeSessionForRecordType({
      id: editingSessionId || crypto.randomUUID(),
      createdAt: resolveSessionCreatedAt(currentSession, new Date().toISOString()),
      deckId: data.get("deckId"),
      recordType: normalizeRecordType(data.get("recordType")),
      deckVersion: data.get("deckVersion")?.trim() || selectedDeck?.version || "v1",
      partnerColor: currentSession
        ? sessionPartnerColor
        : keepsDeckMetadata ? currentSession.partnerColor : selectedDeck?.partnerColor || "",
      caseCardId: currentSession
        ? sessionCaseCardId
        : keepsDeckMetadata ? currentSession.caseCardId : selectedDeck?.caseCardId || "",
      name: data.get("name").trim(),
      date: data.get("date"),
      format: data.get("format"),
      environment: data.get("environment"),
      relatedUrl: normalizeSessionRelatedUrl(data.get("relatedUrl")),
      placement: data.get("placement") || "",
      placementNote: data.get("placementNote")?.trim() || "",
      randomPrizeWon: canWinRandomPrize(data.get("placement")) && data.get("randomPrizeWon") === "on",
      randomPrizeMethod,
      randomPrizeMethodNote: data.get("randomPrizeMethodNote")?.trim() || "",
      staffRpsHands: randomPrizeMethod === "rps" ? [data.get("staffRps1"), data.get("staffRps2"), data.get("staffRps3")] : ["", "", ""]
    });
    if (editingSessionId) {
      state = updateSessionDeck(state, {
        sessionId: editingSessionId,
        deckId: session.deckId,
        deckVersion: session.deckVersion
      });
      state.sessions = state.sessions.map((current) => (current.id === editingSessionId ? session : current));
    } else {
      state.sessions.push(session);
    }
    state.decks = state.decks.map((deck) => deck.id === session.deckId ? { ...deck, lastUsedAt: session.date } : deck);
    route = {
      name: "session",
      sessionId: session.id,
      returnDeckRecordType: normalizeRecordType(route.recordType || session.recordType)
    };
  }

  if (dialogMode === "match") {
    const formState = roundFormState(data.get("result"));
    const opponentPartnerColor = formState.isBye ? "" : normalizePartnerColor(data.get("opponentPartnerColor"));
    const opponentCaseCardId = formState.isBye ? "" : selectedCaseCardId("opponentCaseCardName", opponentPartnerColor);
    if (opponentCaseCardId === null) return;
    const nextMatch = sanitizeRoundRecord({
      id: crypto.randomUUID(),
      sessionId: route.sessionId,
      myDeck: data.get("myDeck").trim(),
      opponentDeck: data.get("opponentDeck").trim() || "不明",
      opponentPlayer: normalizePlayerName(data.get("opponentPlayer")),
      opponentPartnerColor,
      opponentCaseCardId,
      roundType: formState.roundType,
      result: formState.result,
      firstPlayer: data.get("firstPlayer"),
      opponentRps: data.get("opponentRps"),
      myPassed: data.get("myPassed"),
      opponentPassed: data.get("opponentPassed"),
      memo: data.get("memo").trim()
    });

    if (editingMatchId) {
      state.matches = state.matches.map((match) => (
        match.id === editingMatchId ? { ...match, ...nextMatch, id: editingMatchId, sessionId: match.sessionId } : match
      ));
    } else {
      state.matches.push(nextMatch);
    }
  }

  if (repairContext) route = repairContext.route;
  saveState();
  releaseDialogFocus();
  dialog.close();
  entryForm.reset();
  render();
  if (repairContext) {
    const remaining = buildRepairQueue(state, repairContext.field);
    const next = remaining.find((item) => (
      item.match.id !== repairContext.matchId
      && item.session.id !== repairContext.sessionId
    ));
    if (next) window.setTimeout(() => openRepairItem(next), 0);
  }
});

view.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-account-recovery]")) {
    setRoute({ name: "recovery" });
    saveAccountRecoveryStatus({
      status: "reviewing",
      anonymous: accountRecovery.preview?.anonymous,
      ambiguousCount: accountRecovery.preview?.ambiguous.length || 0
    }).catch(() => {});
    return;
  }
  if (event.target.closest("[data-download-recovery-backup]")) {
    saveRecoveryBackup();
    accountRecovery = { ...accountRecovery, message: "統合前JSONを保存しました" };
    render();
    return;
  }
  if (event.target.closest("[data-confirm-account-recovery]")) {
    confirmAccountRecovery();
    return;
  }
  if (event.target.closest("[data-open-repair]")) {
    if (dialog.open) dialog.close();
    setRoute({ name: "repair", repairField: "" });
    return;
  }
  const pendingMatchButton = event.target.closest("[data-open-pending-match]");
  if (pendingMatchButton) {
    event.preventDefault();
    event.stopPropagation();
    if (!adminPreview) openDialog("match", pendingMatchButton.dataset.openPendingMatch);
    return;
  }
  const sessionShare = event.target.closest("[data-session-share]");
  if (sessionShare && Number(sessionShare.dataset.pendingCount) > 0) {
    const count = Number(sessionShare.dataset.pendingCount);
    if (!confirm(`未確定の試合が${count}件あります。\n未確定試合は投稿内容に含まれません。Xを開きますか？`)) {
      event.preventDefault();
      return;
    }
  }
  const adminTabButton = event.target.closest("[data-admin-tab]");
  if (adminTabButton) {
    setRoute({
      ...route,
      name: "admin",
      adminTab: adminTabButton.dataset.adminTab,
      adminMatchup: "",
      adminQualityField: ""
    });
    return;
  }
  const adminMatchupButton = event.target.closest("[data-admin-matchup]");
  if (adminMatchupButton) {
    setRoute({ ...route, name: "admin", adminTab: "matchups", adminMatchup: adminMatchupButton.dataset.adminMatchup });
    return;
  }
  if (event.target.closest("[data-admin-reload]")) {
    loadAdminDashboard();
    return;
  }
  const adminUserButton = event.target.closest("[data-open-admin-user]");
  if (adminUserButton) {
    openAdminUserPreview(adminUserButton.dataset.openAdminUser);
    return;
  }
  const adminQualityField = event.target.closest("[data-admin-quality-field]");
  if (adminQualityField) {
    setRoute({ ...route, name: "admin", adminTab: "quality", adminQualityField: adminQualityField.dataset.adminQualityField });
    return;
  }
  const adminQualityUser = event.target.closest("[data-admin-quality-user]");
  if (adminQualityUser) {
    openAdminUserPreview(adminQualityUser.dataset.adminQualityUser, {
      name: "repair",
      repairField: adminQualityUser.dataset.qualityField || ""
    });
    return;
  }
  const repairButton = event.target.closest("[data-repair-match]");
  if (repairButton) {
    const item = buildRepairQueue(state, route.repairField || "")
      .find((entry) => entry.match.id === repairButton.dataset.repairMatch);
    openRepairItem(item);
    return;
  }
  if (event.target.closest("[data-admin-user-direction]")) {
    setRoute({
      ...route,
      name: "admin",
      adminTab: "users",
      adminUserDirection: route.adminUserDirection === "asc" ? "desc" : "asc"
    });
    return;
  }
  if (event.target.closest("[data-copy-ai-dataset]")) {
    if (!adminState.raw) return;
    navigator.clipboard?.writeText(JSON.stringify(buildAiTrainingDataset(adminState.raw), null, 2));
    const button = event.target.closest("[data-copy-ai-dataset]");
    button.textContent = "コピー済み";
    setTimeout(() => { button.textContent = "匿名AIデータをコピー"; }, 1000);
    return;
  }
  const deckButton = event.target.closest("[data-open-deck]");
  const sessionButton = event.target.closest("[data-open-session]");
  const playerButton = event.target.closest("[data-open-player]");
  const editButton = event.target.closest("[data-edit-match]");
  const editSessionButton = event.target.closest("[data-edit-session]");
  const analysisPivotButton = event.target.closest("[data-analysis-pivot]");
  const analysisColorMatchupButton = event.target.closest("[data-analysis-color-matchup]");
  const matchupButton = event.target.closest("[data-open-matchup]");
  const matchupResultButton = event.target.closest("[data-matchup-result]");
  const matchupTurnButton = event.target.closest("[data-matchup-turn]");
  const renamePlayerButton = event.target.closest("[data-rename-player]");
  const playerDirectionButton = event.target.closest("[data-player-direction]");
  const playerRecordTypeTab = event.target.closest("[data-player-record-type-tab]");
  const deckViewButton = event.target.closest("[data-deck-view]");
  const deckRecordTypeButton = event.target.closest("[data-deck-record-type]");
  const tournamentViewButton = event.target.closest("[data-tournament-view]");
  const storeButton = event.target.closest("[data-open-store]");
  if (deckButton) setRoute({ name: "deckDetail", deckId: deckButton.dataset.openDeck, recordType: "challenge", returnDeckView: route.deckView || "active" });
  if (sessionButton) setRoute({
    name: "session",
    sessionId: sessionButton.dataset.openSession,
    returnDeckRecordType: route.name === "deckDetail" ? normalizeRecordType(route.recordType) : "",
    returnStore: route.name === "storeDetail" ? route.storeName : "",
    returnAfterStore: route.name === "storeDetail" ? route.returnRoute : null
  });
  if (playerButton) setRoute({ ...route, name: "playerDetail", playerName: playerButton.dataset.openPlayer });
  if (editButton && !adminPreview) openDialog("match", editButton.dataset.editMatch);
  if (editSessionButton && !adminPreview) openDialog("session", editSessionButton.dataset.editSession);
  if (analysisPivotButton) setRoute(analysisRoute({ pivot: analysisPivotButton.dataset.analysisPivot, colorMatchup: "" }));
  if (analysisColorMatchupButton) setRoute(analysisRoute({ pivot: "colorMatrix", colorMatchup: analysisColorMatchupButton.dataset.analysisColorMatchup }));
  if (matchupButton) {
    const returnRoute = { ...route, restoreScrollY: window.scrollY };
    setRoute({
      ...route,
      name: "matchupDetail",
      matchupPivot: route.pivot || "opponentDeck",
      matchupName: matchupButton.dataset.openMatchup,
      matchupResult: "all",
      matchupTurn: "all",
      returnRoute
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  if (matchupResultButton) {
    const selectedResult = matchupResultButton.dataset.matchupResult;
    setRoute({ ...route, matchupResult: selectedResult, restoreFocus: `[data-matchup-result="${selectedResult}"]` });
  }
  if (matchupTurnButton) {
    const selectedTurn = matchupTurnButton.dataset.matchupTurn;
    const nextTurn = route.matchupTurn === selectedTurn ? "all" : selectedTurn;
    setRoute({ ...route, matchupTurn: nextTurn, restoreFocus: `[data-matchup-turn="${nextTurn}"]` });
  }
  if (renamePlayerButton && !adminPreview) openDialog("playerRename", renamePlayerButton.dataset.renamePlayer);
  if (playerDirectionButton) setRoute({ ...route, name: "players", playerName: "", playerDirection: route.playerDirection === "asc" ? "desc" : "asc" });
  if (playerRecordTypeTab) setRoute({
    ...route,
    name: "playerDetail",
    playerRecordType: normalizeRecordType(playerRecordTypeTab.dataset.playerRecordTypeTab, { allowAll: true })
  });
  if (deckViewButton) setRoute({ name: "decks", deckView: deckViewButton.dataset.deckView === "archived" ? "archived" : "active" });
  if (deckRecordTypeButton) setRoute({ ...route, name: "deckDetail", recordType: normalizeRecordType(deckRecordTypeButton.dataset.deckRecordType) });
  if (tournamentViewButton) setRoute({ name: "sessions", view: tournamentViewButton.dataset.tournamentView });
  if (storeButton) setRoute({
    name: "storeDetail",
    storeName: storeButton.dataset.openStore,
    returnRoute: ["summary", "matchupDetail"].includes(route.name) ? { ...route } : null
  });
});

view.addEventListener("change", (event) => {
  const adminMonth = event.target.closest("[data-admin-month]");
  if (adminMonth) setRoute({ ...route, name: "admin", adminMonth: adminMonth.value, adminMatchup: "" });
  const adminEnvironment = event.target.closest("[data-admin-environment]");
  if (adminEnvironment) setRoute({ ...route, name: "admin", adminEnvironment: adminEnvironment.value, adminMatchup: "" });
  const adminRecordType = event.target.closest("[data-admin-record-type]");
  if (adminRecordType) setRoute({
    ...route,
    name: "admin",
    adminRecordType: normalizeRecordType(adminRecordType.value, { allowAll: true }),
    adminMonth: "",
    adminEnvironment: "",
    adminMatchup: ""
  });
  const adminExcludePasses = event.target.closest("[data-admin-exclude-passes]");
  if (adminExcludePasses) setRoute({ ...route, name: "admin", adminExcludePasses: adminExcludePasses.checked, adminMatchup: "" });
  const adminConsentedOnly = event.target.closest("[data-admin-consented-only]");
  if (adminConsentedOnly) setRoute({ ...route, name: "admin", adminConsentedOnly: adminConsentedOnly.checked, adminMatchup: "" });
  const adminMinimumColorSamples = event.target.closest("[data-admin-minimum-color-samples]");
  if (adminMinimumColorSamples) setRoute({
    ...route,
    name: "admin",
    adminTab: "matchups",
    adminMinimumColorSamples: adminMinimumColorSamples.checked,
    adminMatchup: ""
  });
  const adminUserStatus = event.target.closest("[data-admin-user-status]");
  if (adminUserStatus) setRoute({ ...route, name: "admin", adminTab: "users", adminUserStatus: adminUserStatus.value });
  const adminUserSort = event.target.closest("[data-admin-user-sort]");
  if (adminUserSort) setRoute({ ...route, name: "admin", adminTab: "users", adminUserSort: adminUserSort.value });
  const repairField = event.target.closest("[data-repair-field]");
  if (repairField) setRoute({ ...route, name: "repair", repairField: repairField.value });
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
  const analysisRecordType = event.target.closest("[data-analysis-record-type]");
  if (analysisRecordType) setRoute(analysisRoute({
    recordType: normalizeRecordType(analysisRecordType.value, { allowAll: true }),
    version: "",
    environment: "",
    store: "",
    colorMatchup: ""
  }));
  const playerSort = event.target.closest("[data-player-sort]");
  if (playerSort) setRoute({ ...route, name: "players", playerName: "", playerSort: playerSort.value });
  const playerMonth = event.target.closest("[data-player-month]");
  if (playerMonth) setRoute({ ...route, name: "players", playerName: "", playerMonth: playerMonth.value });
  const playerEnvironment = event.target.closest("[data-player-environment]");
  if (playerEnvironment) setRoute({ ...route, name: "players", playerName: "", playerEnvironment: playerEnvironment.value });
  const playerRecordType = event.target.closest("[data-player-record-type]");
  if (playerRecordType) setRoute({
    ...route,
    name: "players",
    playerName: "",
    playerRecordType: normalizeRecordType(playerRecordType.value, { allowAll: true }),
    playerMonth: "",
    playerEnvironment: ""
  });
  const excludePasses = event.target.closest("[data-analysis-exclude-passes]");
  if (excludePasses) setRoute(analysisRoute({ excludePasses: excludePasses.checked }));
  const minimumColorSamples = event.target.closest("[data-analysis-minimum-color-samples]");
  if (minimumColorSamples) setRoute(analysisRoute({ minimumColorSamples: minimumColorSamples.checked, colorMatchup: "" }));
});

function updatePlayerSearchResults(search) {
  route = { ...route, name: "players", playerName: "", playerQuery: search.value };
  const selectedPlayerRecordType = normalizeRecordType(route.playerRecordType, { allowAll: true });
  const recordTypeMatches = filterMatchesByRecordType(enrichMatches(state.matches), selectedPlayerRecordType);
  const selectedMonth = analysisMonths(selectedPlayerRecordType).includes(route.playerMonth) ? route.playerMonth : "";
  const environments = uniqueValues(recordTypeMatches.map((match) => match.environment));
  const selectedEnvironment = environments.includes(route.playerEnvironment) ? route.playerEnvironment : "";
  const periodMatches = filterMatchesByEnvironment(filterMatchesByMonth(recordTypeMatches, selectedMonth), selectedEnvironment);
  const query = String(search.value || "").trim().toLocaleLowerCase("ja");
  const sortKey = ["latest", "matches", "winRate", "name"].includes(route.playerSort) ? route.playerSort : "latest";
  const direction = route.playerDirection === "asc" ? "asc" : "desc";
  const rows = sortPlayerOverviews(
    getPlayerOverviews(periodMatches).filter((row) => row.name.toLocaleLowerCase("ja").includes(query)),
    sortKey,
    direction
  );
  const results = view.querySelector("[data-player-results]");
  if (results) results.innerHTML = playerRowsMarkup(rows, query, Boolean(selectedMonth || selectedEnvironment || selectedPlayerRecordType !== "challenge"));
}

view.addEventListener("input", (event) => {
  const search = event.target.closest("[data-player-search]");
  if (search && shouldUpdateSearchFromInput(event)) updatePlayerSearchResults(search);
  const adminSearch = event.target.closest("[data-admin-user-search]");
  if (adminSearch && shouldUpdateSearchFromInput(event)) updateAdminUserSearchResults(adminSearch);
});

view.addEventListener("compositionend", (event) => {
  const search = event.target.closest("[data-player-search]");
  if (search) updatePlayerSearchResults(search);
  const adminSearch = event.target.closest("[data-admin-user-search]");
  if (adminSearch) updateAdminUserSearchResults(adminSearch);
});

dialogFields.addEventListener("change", (event) => {
  const playerInput = event.target.closest("[data-player-name-input]");
  if (playerInput) updatePlayerNameSuggestions(playerInput);
  const sessionDeckSelect = event.target.closest("[data-session-deck-select]");
  if (sessionDeckSelect) updateSessionVersionPicker(sessionDeckSelect.value);
  const sessionRecordType = event.target.closest("[data-session-record-type]");
  if (sessionRecordType) syncSessionRecordTypeFields();
  const partnerColorInput = event.target.closest("[data-partner-color-input]");
  if (partnerColorInput) {
    updateCaseCardPicker(partnerColorInput.dataset.partnerColorInput, partnerColorInput.value);
  }
  const roundResult = event.target.closest("[data-round-result-select]");
  if (roundResult) syncRoundFormFields();
  const placement = event.target.closest("[data-placement-select]");
  if (!placement) return;
  const prize = dialogFields.querySelector("input[name='randomPrizeWon']");
  if (!prize) return;
  prize.disabled = !canWinRandomPrize(placement.value);
  if (prize.disabled) prize.checked = false;
});

dialogFields.addEventListener("input", (event) => {
  const playerInput = event.target.closest("[data-player-name-input]");
  if (playerInput && !event.isComposing) updatePlayerNameSuggestions(playerInput);
  const otpInput = event.target.closest("[data-auth-otp]");
  if (otpInput) otpInput.value = normalizeOtpCode(otpInput.value);
  if (event.target.closest("input[name='relatedUrl']")) showSessionRelatedUrlError();
});

dialogFields.addEventListener("compositionend", (event) => {
  const playerInput = event.target.closest("[data-player-name-input]");
  if (playerInput) updatePlayerNameSuggestions(playerInput);
});

dialogFields.addEventListener("focusin", (event) => {
  const playerInput = event.target.closest("[data-player-name-input]");
  if (playerInput?.value === "不明") playerInput.select();
  if (playerInput) updatePlayerNameSuggestions(playerInput);
});

dialogFields.addEventListener("click", (event) => {
  const caseCardTrigger = event.target.closest("[data-open-case-card-picker]");
  if (caseCardTrigger) {
    openCaseCardDialog(caseCardTrigger.dataset.openCaseCardPicker);
    return;
  }

  const playerSuggestion = event.target.closest("[data-player-name-suggestion]");
  if (playerSuggestion) {
    const field = playerSuggestion.closest(".player-name-field");
    const input = field?.querySelector("[data-player-name-input]");
    const menu = field?.querySelector("[data-player-name-suggestions]");
    if (!input) return;
    input.value = replaceWithPlayerNameSuggestion(input.value, playerSuggestion.dataset.playerNameSuggestion);
    input.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
    input.focus();
    return;
  }

  if (event.target.closest("[data-close-admin-preview]")) {
    dialog.close();
    closeAdminUserPreview();
    return;
  }

  if (event.target.closest("[data-open-guide]")) {
    window.location.href = "./guide.html";
    return;
  }

  if (event.target.closest("[data-open-admin]")) {
    dialog.close();
    route = { name: "admin" };
    render();
    loadAdminDashboard();
    return;
  }

  const menuPanelButton = event.target.closest("[data-open-menu-panel]");
  if (menuPanelButton) {
    const panel = menuPanelButton.dataset.openMenuPanel;
    if (panel === "dataSettings") dataSettingsMessage = "";
    if (panel === "releaseHistory") {
      loadReleaseManifest().then(() => {
        openDialog("releaseHistory");
        const currentRelease = releaseForVersion(releaseManifest, appVersion);
        if (currentRelease) markReleaseSeen(localStorage, currentRelease.version);
      });
      return;
    }
    openDialog(panel);
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
    const button = event.target.closest("[data-cloud-login]");
    const input = dialogFields.querySelector("input[name='cloudEmail']");
    const usernameInput = dialogFields.querySelector("input[name='cloudUsername']");
    const consentInput = dialogFields.querySelector("input[name='termsAccepted']");
    const email = input.value.trim();
    const username = normalizeUsername(usernameInput?.value);
    const usernameError = validateUsername(username);
    if (usernameError) {
      usernameInput.setCustomValidity(usernameError);
      usernameInput.reportValidity();
      usernameInput.setCustomValidity("");
      return;
    }
    if (!email) {
      input.setCustomValidity("メールアドレスを入力してください");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    if (!consentInput?.checked) {
      consentInput.setCustomValidity("利用規約とプライバシーポリシーへの同意が必要です");
      consentInput.reportValidity();
      consentInput.setCustomValidity("");
      return;
    }
    button.disabled = true;
    button.textContent = "メール送信中...";
    signInWithEmail(email, { username, termsVersion })
      .then(() => {
        registrationFeedback = saveAuthChallenge(localStorage, createAuthChallenge({
          email,
          username,
          mode: "signup",
          termsVersion
        }));
        cloudMessage = "";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = authEmailErrorMessage(error);
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-reset-registration]")) {
    clearAuthChallenge(localStorage);
    registrationFeedback = null;
    cloudMessage = "";
    openDialog("cloudSettings");
    return;
  }

  if (event.target.closest("[data-cloud-existing-login]")) {
    const button = event.target.closest("[data-cloud-existing-login]");
    const input = dialogFields.querySelector("input[name='existingCloudEmail']");
    const email = input.value.trim();
    if (!email) {
      input.setCustomValidity("メールアドレスを入力してください");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    button.disabled = true;
    button.textContent = "メール送信中...";
    signInWithEmail(email, {}, false)
      .then(() => {
        registrationFeedback = saveAuthChallenge(localStorage, createAuthChallenge({
          email,
          mode: "login"
        }));
        cloudMessage = "";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = authEmailErrorMessage(error);
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-verify-auth-code]")) {
    const button = event.target.closest("[data-verify-auth-code]");
    const input = dialogFields.querySelector("input[name='cloudOtp']");
    const token = normalizeOtpCode(input?.value);
    if (!registrationFeedback) {
      cloudMessage = "認証情報の有効期限が切れました。もう一度コードを送信してください。";
      openDialog("cloudSettings");
      return;
    }
    if (!isValidOtpCode(token)) {
      input.setCustomValidity("メールに届いた認証コードを省略せず入力してください");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    const mode = registrationFeedback.mode;
    button.disabled = true;
    button.textContent = "認証中...";
    verifyEmailOtp(registrationFeedback.email, token)
      .then(async () => {
        clearAuthChallenge(localStorage);
        registrationFeedback = null;
        await refreshCloudSession();
        if (!cloudStatus.signedIn) throw new Error("認証状態を確認できませんでした");
        cloudMessage = mode === "signup" ? "ユーザー登録が完了しました" : "ログインしました";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = authOtpErrorMessage(error);
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-resend-auth-code]")) {
    if (!registrationFeedback) return;
    const button = event.target.closest("[data-resend-auth-code]");
    const challenge = registrationFeedback;
    const account = challenge.mode === "signup"
      ? { username: challenge.username, termsVersion: challenge.termsVersion || termsVersion }
      : {};
    button.disabled = true;
    button.textContent = "再送信中...";
    signInWithEmail(challenge.email, account, challenge.mode === "signup")
      .then(() => {
        registrationFeedback = saveAuthChallenge(localStorage, createAuthChallenge({ ...challenge }));
        cloudMessage = "新しい認証コードを送信しました";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = authEmailErrorMessage(error);
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-save-account-setup]")) {
    const button = event.target.closest("[data-save-account-setup]");
    const usernameInput = dialogFields.querySelector("input[name='accountUsername']");
    const consentInput = dialogFields.querySelector("input[name='accountTermsAccepted']");
    const username = normalizeUsername(usernameInput?.value);
    const usernameError = validateUsername(username);
    if (usernameError) {
      usernameInput.setCustomValidity(usernameError);
      usernameInput.reportValidity();
      usernameInput.setCustomValidity("");
      return;
    }
    if (!consentInput?.checked) {
      consentInput.setCustomValidity("利用規約とプライバシーポリシーへの同意が必要です");
      consentInput.reportValidity();
      consentInput.setCustomValidity("");
      return;
    }
    button.disabled = true;
    button.textContent = "保存中...";
    saveAccountSetup({ username, termsVersion })
      .then((context) => {
        accountContext = context;
        cloudMessage = "アカウント登録が完了しました";
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = `登録失敗: ${error.message}`;
        openDialog("cloudSettings");
      });
    return;
  }

  if (event.target.closest("[data-update-profile-username]")) {
    const button = event.target.closest("[data-update-profile-username]");
    const input = dialogFields.querySelector("input[name='profileUsername']");
    const username = normalizeUsername(input?.value);
    const usernameError = validateUsername(username);
    if (usernameError) {
      input.setCustomValidity(usernameError);
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    button.disabled = true;
    button.textContent = "変更中...";
    updateProfileUsername(username)
      .then(() => {
        accountContext = { ...accountContext, username };
        cloudMessage = `ユーザー名を「${username}」へ変更しました`;
        openDialog("cloudSettings");
      })
      .catch((error) => {
        cloudMessage = `ユーザー名を変更できませんでした: ${error.message}`;
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
        activateAnonymousLocalState();
        accountRecovery = { anonymous: null, preview: null, message: "", saving: false };
        accountContext = { schemaReady: false, username: "", termsAccepted: false, termsVersion: "", role: "" };
        adminState = { loading: false, error: "", data: null, raw: null };
        cloudMessage = "ログアウトしました";
        render();
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
    const confirmed = confirm(`「${deck.name}」を削除しますか？\n関連する${sessionCount}セッション、${matchCount}ラウンドも削除されます。`);
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
    const confirmed = confirm(`「${session.name}」を削除しますか？\nこのセッションの${matchCount}ラウンドも削除されます。`);
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
    if (!value || accountContext.role !== "superadmin") return;
    const button = event.target.closest("[data-add-environment]");
    button.disabled = true;
    addEnvironmentCatalogItem(value)
      .then(async () => {
        environmentCatalogMessage = `「${value}」を追加しました`;
        await refreshEnvironmentCatalog(true);
        updateSuggestions();
        openDialog("dataSettings");
      })
      .catch((error) => {
        environmentCatalogMessage = environmentActionError(error);
        openDialog("dataSettings");
      });
    return;
  }

  const renameEnvironmentButton = event.target.closest("[data-rename-environment]");
  if (renameEnvironmentButton) {
    if (accountContext.role !== "superadmin") return;
    const id = renameEnvironmentButton.dataset.renameEnvironment;
    const from = renameEnvironmentButton.dataset.currentEnvironment;
    const to = dialogFields.querySelector(`input[name='environmentName-${id}']`)?.value.trim();
    if (!to || from === to) return;
    const usage = Number(environmentCatalog.find((item) => String(item.id) === id)?.usage_count || 0);
    const confirmed = confirm(`「${from}」を「${to}」へ変更しますか？\n全利用者の${usage}セッションに反映されます。`);
    if (!confirmed) return;
    renameEnvironmentButton.disabled = true;
    renameEnvironmentCatalogItem(from, to)
      .then(async () => {
        state = renameEnvironmentInState(state, from, to);
        localStorage.setItem(storageKey, JSON.stringify(state));
        await pushCloudState({ force: true, silent: true });
        environmentCatalogMessage = `「${from}」を「${to}」へ変更しました`;
        await refreshEnvironmentCatalog(true);
        updateSuggestions();
        openDialog("dataSettings");
      })
      .catch((error) => {
        environmentCatalogMessage = environmentActionError(error);
        openDialog("dataSettings");
      });
    return;
  }

  const deleteEnvironmentButton = event.target.closest("[data-delete-environment]");
  if (deleteEnvironmentButton) {
    if (accountContext.role !== "superadmin" || deleteEnvironmentButton.disabled) return;
    const name = deleteEnvironmentButton.dataset.deleteEnvironment;
    if (!confirm(`未使用の環境「${name}」を削除しますか？`)) return;
    deleteEnvironmentButton.disabled = true;
    deleteEnvironmentCatalogItem(name)
      .then(async () => {
        environmentCatalogMessage = `「${name}」を削除しました`;
        await refreshEnvironmentCatalog(true);
        openDialog("dataSettings");
      })
      .catch((error) => {
        environmentCatalogMessage = environmentActionError(error);
        openDialog("dataSettings");
      });
    return;
  }

  if (event.target.closest("[data-update-deck]")) {
    const deck = getDeck(event.target.closest("[data-update-deck]").dataset.updateDeck);
    const name = dialogFields.querySelector("input[name='deckName']")?.value.trim();
    const version = dialogFields.querySelector("input[name='deckVersion']")?.value.trim();
    const partnerColor = normalizePartnerColor(dialogFields.querySelector("input[name='deckPartnerColor']:checked")?.value);
    const caseCardId = selectedCaseCardId("deckCaseCardName", partnerColor);
    if (caseCardId === null) return;
    if (!deck || !name || !version) return;
    const sessionIds = new Set(sessionsForDeck(deck.id).map((session) => session.id));
    state.decks = state.decks.map((item) => item.id === deck.id ? { ...item, name, version, partnerColor, caseCardId } : item);
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
    dataSettingsMessage = `${affected}試合の名称を「${to}」へ統合しました`;
    openDialog("dataSettings");
    return;
  }

  if (event.target.closest("[data-trim-player-honorific]")) {
    const preview = previewPlayerNameHonorificTrim(state);
    if (!preview.affectedMatches) {
      dataSettingsMessage = "「さん」の後ろに文字が続くプレイヤー名はありません";
      openDialog("dataSettings");
      return;
    }
    openDialog("playerNameTrimPreview");
    return;
  }

  if (event.target.closest("[data-confirm-trim-player-honorific]")) {
    const result = trimPlayerNamesAtHonorific(state);
    if (!result.affected) {
      dataSettingsMessage = "変更対象のプレイヤー名はありません";
      openDialog("dataSettings");
      return;
    }
    state = result.state;
    saveState();
    updateSuggestions();
    dataSettingsMessage = `${result.affected}試合のプレイヤー名を変更しました。試合データは削除されていません`;
    openDialog("dataSettings");
    return;
  }

  if (event.target.closest("[data-merge-stores]")) {
    const from = dialogFields.querySelector("select[name='storeMergeFrom']").value;
    const to = dialogFields.querySelector("input[name='storeMergeTo']").value.trim();
    if (!from || !to || from === to) return;
    const affected = state.sessions.filter((session) => session.name === from).length;
    const confirmed = confirm(`「${from}」を「${to}」へ統合しますか？\n${affected}セッションの店舗名が変更されます。`);
    if (!confirmed) return;
    const result = mergeStoreName(state, from, to);
    state = result.state;
    saveState();
    if (route.name === "storeDetail" && route.storeName === from) {
      route = { ...route, storeName: to };
      render();
    }
    dataSettingsMessage = `${result.affected}セッションの店舗名を「${to}」へ統合しました`;
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
  if (!confirm("この試合記録を削除しますか？")) return;
  state.matches = state.matches.filter((match) => match.id !== editingMatchId);
  saveState();
  dialog.close();
  entryForm.reset();
  editingMatchId = null;
  render();
});

fabButton.addEventListener("click", () => {
  if (adminPreview) return;
  if (route.name === "decks") openDialog("deck");
  if (route.name === "deckDetail") openDialog("session");
  if (route.name === "sessions") openDialog("session");
  if (route.name === "session") openDialog("match");
});

backButton.addEventListener("click", () => {
  if (adminPreview && ["decks", "summary", "players", "sessions", "repair"].includes(route.name)) {
    closeAdminUserPreview();
    return;
  }
  if (route.name === "deckDetail") setRoute({ name: "decks", deckView: route.returnDeckView || "active" });
  if (route.name === "session") {
    const session = getSession(route.sessionId);
    if (route.returnStore) setRoute({ name: "storeDetail", storeName: route.returnStore, returnRoute: route.returnAfterStore });
    else setRoute(session ? {
      name: "deckDetail",
      deckId: session.deckId,
      recordType: normalizeRecordType(route.returnDeckRecordType || session.recordType)
    } : { name: "sessions" });
  }
  if (route.name === "playerDetail") setRoute({ name: "players", playerQuery: route.playerQuery || "", playerSort: route.playerSort || "latest", playerDirection: route.playerDirection || "desc", playerMonth: route.playerMonth || "", playerEnvironment: route.playerEnvironment || "", playerRecordType: normalizeRecordType(route.playerRecordType, { allowAll: true }) });
  if (route.name === "storeDetail") setRoute(route.returnRoute || { name: "sessions", view: "stores" });
  if (route.name === "matchupDetail") setRoute(route.returnRoute || analysisRoute());
  if (route.name === "repair") setRoute({ name: "summary" });
  if (route.name === "recovery") setRoute({ name: "decks" });
  if (route.name === "admin") setRoute({ name: "decks" });
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
  if (adminPreview) return;
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
if (accountOnboardingActive) {
  cloudMessage = "ユーザー名とメールアドレスで無料登録できます";
  openDialog("cloudSettings");
  history.replaceState(null, "", clearAccountOnboardingUrl(window.location.href));
}
refreshCloudSession();
initializeReleaseNotes();

dialog.addEventListener("close", () => {
  closeCaseCardDialog();
  accountOnboardingActive = false;
});

caseCardDialogClose.addEventListener("click", closeCaseCardDialog);
caseCardClear.addEventListener("click", clearCaseCardSelection);

caseCardDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-case-card-picker]")) {
    closeCaseCardDialog();
    return;
  }
  const option = event.target.closest("[data-select-case-card]");
  if (option) selectCaseCard(option.dataset.selectCaseCard);
});

caseCardDialog.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeCaseCardDialog();
});

caseCardSearch.addEventListener("input", (event) => {
  if (shouldUpdateSearchFromInput(event)) renderCaseCardDialogOptions();
});

caseCardSearch.addEventListener("compositionend", renderCaseCardDialogOptions);

function passOptions(selected = "none") {
  return [
    ["none", "無し"],
    ["pass1", "1パス"],
    ["pass2", "2パス"],
    ["pass3", "3パス"],
    ["pass12", "1&2パス"]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function partnerColorChoices(name, selected = "", scope = "") {
  const normalized = normalizePartnerColor(selected);
  return `
    <fieldset class="partner-color-field">
      <legend>パートナーの色</legend>
      <div class="partner-color-choices" role="radiogroup" aria-label="パートナーの色">
        <label class="partner-color-choice unrecorded" title="未記録">
          <input type="radio" name="${name}" value="" data-partner-color-input="${scope}" ${normalized ? "" : "checked"}>
          <span>未</span>
        </label>
        ${partnerColors.map((color) => `
          <label class="partner-color-choice ${color.id}" title="${color.label}">
            <input type="radio" name="${name}" value="${color.id}" data-partner-color-input="${scope}" ${normalized === color.id ? "checked" : ""}>
            <span>${color.label}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function caseCardPicker({ inputName, selectedCaseCardId = "", partnerColor = "", scope = "" }) {
  const color = normalizePartnerColor(partnerColor);
  const candidates = caseCardsForPartnerColor(color, caseCardUsageCounts(scope));
  const selectedCard = getCaseCard(selectedCaseCardId);
  const validSelection = selectedCard && isCaseCardAvailableForPartnerColor(selectedCard.id, color) ? selectedCard : null;
  const disabled = !color || candidates.length === 0;
  const placeholder = caseCardPickerPlaceholder(color, candidates.length);
  return `
    <div class="case-card-picker" data-case-card-picker="${scope}">
      <span class="case-card-picker-label">事件カード</span>
      <input type="hidden" name="${inputName}" data-case-card-input="${scope}" value="${escapeHtml(validSelection?.id || "")}">
      <button class="case-card-trigger" type="button" data-open-case-card-picker="${scope}" ${disabled ? "disabled" : ""}>
        <span data-case-card-selection="${scope}" class="${validSelection ? "" : "is-placeholder"}">${escapeHtml(validSelection?.name || placeholder)}</span>
        <b aria-hidden="true">›</b>
      </button>
    </div>
  `;
}

function caseCardPickerPlaceholder(color, candidateCount) {
  if (!color) return "先にパートナーの色を選択";
  return candidateCount ? "事件カードを選択" : "この色の候補は準備中";
}

function updateCaseCardPicker(scope, partnerColor) {
  const input = dialogFields.querySelector(`[data-case-card-input="${scope}"]`);
  const trigger = dialogFields.querySelector(`[data-open-case-card-picker="${scope}"]`);
  const selection = dialogFields.querySelector(`[data-case-card-selection="${scope}"]`);
  if (!input || !trigger || !selection) return;
  const color = normalizePartnerColor(partnerColor);
  const candidates = caseCardsForPartnerColor(color, caseCardUsageCounts(scope));
  const selectedCard = getCaseCard(input.value);
  if (selectedCard && !isCaseCardAvailableForPartnerColor(selectedCard.id, color)) input.value = "";
  const currentCard = getCaseCard(input.value);
  trigger.disabled = !color || candidates.length === 0;
  selection.textContent = currentCard?.name || caseCardPickerPlaceholder(color, candidates.length);
  selection.classList.toggle("is-placeholder", !currentCard);
  if (!color || candidates.length === 0) {
    if (!caseCardDialog.hidden && activeCaseCardScope === scope) closeCaseCardDialog();
  }
}

function activeCaseCardColor() {
  return normalizePartnerColor(
    dialogFields.querySelector(`[data-partner-color-input="${activeCaseCardScope}"]:checked`)?.value
  );
}

function openCaseCardDialog(scope) {
  const picker = dialogFields.querySelector(`[data-case-card-picker="${scope}"]`);
  const trigger = dialogFields.querySelector(`[data-open-case-card-picker="${scope}"]`);
  const color = normalizePartnerColor(
    dialogFields.querySelector(`[data-partner-color-input="${scope}"]:checked`)?.value
  );
  if (!picker || !trigger || !color) return;
  activeCaseCardScope = scope;
  caseCardReturnFocus = trigger;
  caseCardSearch.value = "";
  caseCardDialogKicker.textContent = partnerColorLabel(color);
  caseCardClear.hidden = !dialogFields.querySelector(`[data-case-card-input="${scope}"]`)?.value;
  renderCaseCardDialogOptions();
  caseCardOptionsView.scrollTop = 0;
  entryForm.inert = true;
  caseCardDialog.hidden = false;
  requestAnimationFrame(() => {
    caseCardOptionsView.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    caseCardDialogClose.focus({ preventScroll: true });
  });
}

function closeCaseCardDialog() {
  const returnFocus = caseCardReturnFocus;
  caseCardDialog.hidden = true;
  entryForm.inert = false;
  activeCaseCardScope = "";
  caseCardReturnFocus = null;
  if (dialog.open && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

function renderCaseCardDialogOptions() {
  const color = activeCaseCardColor();
  if (!color) {
    caseCardOptionsView.innerHTML = "";
    return;
  }
  const usageCounts = caseCardUsageCounts(activeCaseCardScope);
  const query = String(caseCardSearch.value || "").trim().normalize("NFKC").toLocaleLowerCase("ja");
  const cards = caseCardsForPartnerColor(color, usageCounts).filter((card) => (
    !query || card.name.normalize("NFKC").toLocaleLowerCase("ja").includes(query)
  ));
  const selectedId = dialogFields.querySelector(`[data-case-card-input="${activeCaseCardScope}"]`)?.value || "";
  caseCardOptionsView.innerHTML = cards.length ? cards.map((card) => {
    const usage = Number(usageCounts[card.id] || 0);
    return `
      <button class="case-card-option" type="button" role="option" data-select-case-card="${card.id}" aria-selected="${card.id === selectedId}">
        <span>
          <strong>${escapeHtml(card.name)}</strong>
          <small>${escapeHtml(caseCardColorLabel(card))}</small>
        </span>
        ${usage ? `<b>${usage}回</b>` : ""}
      </button>
    `;
  }).join("") : `<p class="case-card-empty">一致する事件カードがありません。</p>`;
}

function selectCaseCard(caseCardId) {
  const input = dialogFields.querySelector(`[data-case-card-input="${activeCaseCardScope}"]`);
  const selection = dialogFields.querySelector(`[data-case-card-selection="${activeCaseCardScope}"]`);
  const card = getCaseCard(caseCardId);
  if (!input || !selection || !card || !isCaseCardAvailableForPartnerColor(card.id, activeCaseCardColor())) return;
  input.value = card.id;
  selection.textContent = card.name;
  selection.classList.remove("is-placeholder");
  closeCaseCardDialog();
}

function clearCaseCardSelection() {
  const scope = activeCaseCardScope;
  const input = dialogFields.querySelector(`[data-case-card-input="${scope}"]`);
  const selection = dialogFields.querySelector(`[data-case-card-selection="${scope}"]`);
  if (!input || !selection) return;
  input.value = "";
  selection.textContent = "事件カードを選択";
  selection.classList.add("is-placeholder");
  closeCaseCardDialog();
}

function caseCardUsageCounts(scope) {
  const caseCardIds = scope === "opponent"
    ? state.matches.map((match) => match.opponentCaseCardId)
    : state.sessions.map((session) => session.caseCardId);
  return caseCardIds.reduce((counts, caseCardId) => {
    if (!caseCardId) return counts;
    counts[caseCardId] = (counts[caseCardId] || 0) + 1;
    return counts;
  }, {});
}

function updateSessionVersionPicker(deckId) {
  const select = dialogFields.querySelector("[data-session-version-select]");
  if (!select) return;
  const deck = getDeck(deckId);
  const versions = sessionVersionOptions(state, deckId);
  select.innerHTML = optionTags(versions.map((version) => [version, version]), deck?.version || versions[0] || "v1");
}

function selectedCaseCardId(inputName, partnerColor) {
  const input = dialogFields.querySelector(`input[name="${inputName}"]`);
  const caseCardId = input?.value.trim() || "";
  if (!caseCardId) return "";
  if (isCaseCardAvailableForPartnerColor(caseCardId, partnerColor)) return caseCardId;
  openCaseCardDialog(input?.dataset.caseCardInput || "");
  return null;
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

function catalogEnvironmentOptions() {
  return uniqueValues(environmentCatalog.filter((item) => item.active !== false).map((item) => item.name));
}

function sessionEnvironmentField(editingSession) {
  const selected = editingSession?.environment || preferredEnvironment();
  const masterOptions = environmentCatalogReady ? catalogEnvironmentOptions() : environmentOptions();
  const options = uniqueValues([
    ...masterOptions.filter((environment) => environment !== "未設定"),
    ...(editingSession?.environment ? [editingSession.environment] : [])
  ]);
  return `
    <label>環境<select name="environment" required>
      ${options.length ? "" : `<option value="" selected disabled>管理者による環境登録が必要です</option>`}
      ${options.map((environment) => `<option value="${escapeHtml(environment)}" ${environment === selected ? "selected" : ""}>${escapeHtml(environment)}</option>`).join("")}
    </select></label>
    ${environmentCatalogReady ? "" : `<p class="form-note">環境マスターを読み込めないため、一時的に過去に使用した環境だけ選べます。</p>`}
  `;
}

function preferredEnvironment() {
  return catalogEnvironmentOptions()[0] || "";
}

async function refreshEnvironmentCatalog(admin = accountContext.role === "superadmin") {
  try {
    environmentCatalog = admin
      ? await loadAdminEnvironmentCatalog()
      : await loadEnvironmentCatalog();
    environmentCatalogReady = true;
    environmentCatalogError = "";
  } catch (error) {
    environmentCatalogReady = false;
    environmentCatalogError = String(error?.message || "");
  }
}

function environmentActionError(error) {
  const message = String(error?.message || "");
  if (message.includes("already exists") || message.includes("duplicate key")) {
    return "同じ名前の環境がすでに登録されています。";
  }
  if (message.includes("in use")) return "使用中の環境は削除できません。先に名称変更で別の環境へ統合してください。";
  if (message.includes("Administrator")) return "環境を変更できるのは管理者だけです。";
  return "環境マスターを更新できませんでした。通信状況を確認してください。";
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
    await refreshEnvironmentCatalog(false);
    if (cloudStatus.signedIn) {
      activateUserLocalState(cloudStatus.userId);
      clearAuthChallenge(localStorage);
      registrationFeedback = null;
      try {
        accountContext = await loadAccountContext();
      } catch (error) {
        accountContext = { schemaReady: false, username: "", termsAccepted: false, termsVersion: "", role: "" };
        if (!String(error.message || "").includes("Could not find the table")) {
          cloudMessage = `アカウント情報の読込失敗: ${error.message}`;
        }
      }
      if (accountContext.role === "superadmin") await refreshEnvironmentCatalog(true);
      await pullCloudState({ uploadWhenEmpty: true, silent: true });
      await refreshAccountRecovery();
      render();
      if (accountContext.schemaReady && !accountContext.termsAccepted) {
        cloudMessage = "ユーザー名と規約同意を登録してください";
        openDialog("cloudSettings");
      }
    }
    rerenderOpenMenu();
  } catch (error) {
    cloudMessage = `クラウド接続失敗: ${error.message}`;
    rerenderOpenMenu();
  }
}

async function loadAdminDashboard() {
  if (accountContext.role !== "superadmin") return;
  adminState = { loading: true, error: "", data: null, raw: null };
  if (route.name === "admin") render();
  try {
    const raw = await loadAdminData();
    adminState = { loading: false, error: "", data: buildAdminOverview(raw), raw };
  } catch (error) {
    adminState = { loading: false, error: `管理データの読込に失敗しました: ${error.message}`, data: null, raw: null };
  }
  if (route.name === "admin") render();
}

async function openAdminUserPreview(userId, destination = { name: "decks" }) {
  if (accountContext.role !== "superadmin" || adminPreview) return;
  const usersTab = route.adminTab === "users";
  const dashboard = buildAdminDashboard(adminState.raw || {}, {
    month: usersTab ? "" : route.adminMonth || "",
    environment: usersTab ? "" : route.adminEnvironment || "",
    excludePasses: usersTab ? false : Boolean(route.adminExcludePasses),
    consentedOnly: usersTab ? false : Boolean(route.adminConsentedOnly)
  });
  const user = dashboard.userRows.find((row) => row.userId === userId)
    || adminState.data?.userRows.find((row) => row.userId === userId);
  if (!user) return;
  adminState = { ...adminState, previewLoadingUserId: userId };
  render();
  try {
    window.clearTimeout(cloudSaveTimer);
    const remote = await loadAdminUserState(userId);
    adminPreview = beginAdminPreview(state, user, remote);
    adminPreview.recovery = user.recovery || null;
    state = normalizeState(adminPreview.viewedState);
    route = destination;
    dialog.close();
    render();
  } catch (error) {
    adminState = {
      ...adminState,
      previewLoadingUserId: "",
      error: `利用者データの読込に失敗しました: ${error.message}`
    };
    render();
  }
}

function closeAdminUserPreview() {
  if (!adminPreview) return;
  state = endAdminPreview(adminPreview);
  adminPreview = null;
  adminState = { ...adminState, previewLoadingUserId: "", error: "" };
  route = { name: "admin" };
  render();
  if (localDirty) scheduleCloudSave();
}

async function pullCloudState(options = {}) {
  const { uploadWhenEmpty = false, silent = false } = options;
  const requestEpoch = storageEpoch;
  try {
    if (!silent) {
      cloudMessage = "クラウド読込中";
      rerenderOpenMenu();
    }
    const remote = await loadCloudState();
    if (requestEpoch !== storageEpoch) return;
    if (remote?.data) {
      const cleanedRemote = removeLegacyMockState(remote.data);
      if (!statesEqual(remote.data, cleanedRemote)) {
        state = normalizeState(cleanedRemote);
        localStorage.setItem(storageKey, JSON.stringify(state));
        cloudUpdatedAt = remote.updated_at;
        await pushCloudState({ force: true, silent: true });
        cloudMessage = "サンプルデータを削除して同期しました";
        route = validRouteAfterSync(route);
        render();
        rerenderOpenMenu();
        return;
      }
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
  const requestEpoch = storageEpoch;
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
    if (requestEpoch !== storageEpoch) return;
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
    return true;
  } catch (error) {
    if (requestEpoch !== storageEpoch) return;
    cloudConflict = error.code === "CLOUD_CONFLICT";
    cloudMessage = `クラウド保存失敗: ${error.message}`;
    rerenderOpenMenu();
    return false;
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
  loadReleaseManifest().then((manifest) => {
    const release = latestRelease(manifest);
    availableRelease = release;
    updateBannerTitle.textContent = release?.title || "新しい更新があります";
    updateBannerSummary.textContent = release?.summary || "更新内容を確認して反映できます";
  });
}

showUpdateDetailsButton?.addEventListener("click", async () => {
  const manifest = await loadReleaseManifest();
  availableRelease = latestRelease(manifest);
  openDialog("releaseNotes", availableRelease?.version || "");
});

applyUpdateButton?.addEventListener("click", () => window.location.reload());

async function loadReleaseManifest() {
  if (releaseLoadPromise) return releaseLoadPromise;
  releaseLoadPromise = fetch("./releases.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Release metadata request failed: ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      releaseManifest = normalizeReleaseManifest(payload);
      return releaseManifest;
    })
    .catch(() => releaseManifest);
  return releaseLoadPromise;
}

async function initializeReleaseNotes() {
  const manifest = await loadReleaseManifest();
  const release = unseenRelease(manifest, readSeenReleaseVersion(localStorage), appVersion);
  if (!release || dialog.open || accountOnboardingActive) return;
  openDialog("releaseNotes", release.version);
  markReleaseSeen(localStorage, release.version);
}

function releaseDetailsMarkup(release) {
  if (!release) {
    return `<div class="release-empty" role="status">更新情報を取得できませんでした。更新はそのまま実行できます。</div>`;
  }
  return `
    <section class="release-details">
      <div class="release-meta"><span>v${escapeHtml(release.version)}</span><time datetime="${escapeHtml(release.releasedAt)}">${escapeHtml(release.releasedAt)}</time></div>
      ${release.summary ? `<p>${escapeHtml(release.summary)}</p>` : ""}
      <ul>${release.items.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function releaseHistoryMarkup(manifest) {
  if (!manifest.releases.length) {
    return `<div class="release-empty" role="status">更新情報を取得できませんでした。</div>`;
  }
  return `
    <div class="release-history">
      ${manifest.releases.map((release) => `
        <article>
          <div class="release-meta"><span>v${escapeHtml(release.version)}</span><time datetime="${escapeHtml(release.releasedAt)}">${escapeHtml(release.releasedAt)}</time></div>
          <h3>${escapeHtml(release.title)}</h3>
          ${release.summary ? `<p>${escapeHtml(release.summary)}</p>` : ""}
          <ul>${release.items.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </article>
      `).join("")}
    </div>
  `;
}

function cloudMenuMarkup() {
  const config = getCloudConfig();
  const statusText = cloudStatus.signedIn
    ? accountContext.username || cloudStatus.email
    : cloudStatus.configured
      ? "未登録 / 未ログイン"
      : "利用できません";

  return `
    <div class="cloud-manager">
      <div class="cloud-head">
        <strong>${cloudStatus.signedIn ? "クラウド同期" : "アカウント"}</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
      ${cloudMessage ? `<p class="cloud-message" role="alert">${escapeHtml(cloudMessage)}</p>` : ""}
      ${cloudStatus.configured ? "" : `
        <div class="account-intro">
          <strong>現在ユーザー登録を利用できません</strong>
          <span>アプリ管理者へ連絡してください。</span>
        </div>
        <details class="import-panel compact-help">
          <summary>管理者向けSupabase設定</summary>
          <label>Supabase URL<input name="supabaseUrl" inputmode="url" placeholder="https://xxxx.supabase.co" value="${escapeHtml(config.url || "")}"></label>
          <label>Publishable key<input name="supabaseAnonKey" placeholder="sb_publishable_..." value="${escapeHtml(config.anonKey || "")}"></label>
          <button class="primary-button inline-action" type="button" data-save-cloud-config>Supabase設定を保存</button>
        </details>
      `}
      ${cloudStatus.configured && !cloudStatus.signedIn ? registrationFeedback ? registrationSentMarkup() : `
        <div class="account-intro">
          <strong>無料でユーザー登録</strong>
          <span>ユーザー名とメールアドレスを登録します。</span>
        </div>
        <label>ユーザー名<input name="cloudUsername" autocomplete="nickname" maxlength="20" placeholder="2〜20文字"></label>
        <label>メールアドレス<input name="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
        ${termsDisclosureMarkup()}
        <label class="consent-field"><input name="termsAccepted" type="checkbox">利用規約とプライバシーポリシーに同意する</label>
        <button class="primary-button inline-action" type="button" data-cloud-login>登録コードをメールで受け取る</button>
        <p class="form-note">メールに届く認証コードを、この画面へ入力します。パスワードは不要です。</p>
        <details class="terms-disclosure existing-login">
          <summary>登録済みの方はこちら</summary>
          <p>Safariではログイン済みでも、ホーム画面のアプリではここからログインコードを受け取ってください。</p>
          <label>メールアドレス<input name="existingCloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
          <button class="primary-button inline-action" type="button" data-cloud-existing-login>ログインコードを受け取る</button>
        </details>
      ` : ""}
      ${cloudStatus.signedIn ? `
        ${accountContext.schemaReady && !accountContext.termsAccepted ? `
          <div class="account-intro account-attention">
            <strong>アカウント情報を完了してください</strong>
            <span>引き続き利用するため、ユーザー名と規約同意が必要です。</span>
          </div>
          <label>ユーザー名<input name="accountUsername" autocomplete="nickname" maxlength="20" value="${escapeHtml(accountContext.username)}"></label>
          ${termsDisclosureMarkup()}
          <label class="consent-field"><input name="accountTermsAccepted" type="checkbox">利用規約とプライバシーポリシーに同意する</label>
          <button class="primary-button inline-action" type="button" data-save-account-setup>登録を完了する</button>
        ` : ""}
        ${accountContext.schemaReady && accountContext.termsAccepted ? `
          <details class="terms-disclosure profile-settings">
            <summary>ユーザー名を変更</summary>
            <label>ユーザー名<input name="profileUsername" autocomplete="nickname" maxlength="20" value="${escapeHtml(accountContext.username)}"></label>
            <button class="primary-button inline-action" type="button" data-update-profile-username>ユーザー名を変更</button>
          </details>
        ` : ""}
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

function termsDisclosureMarkup() {
  return `
    <details class="terms-disclosure">
      <summary>利用上の注意</summary>
      <p>記録はサービス運営、統計分析、管理者による利用者別の記録確認・利用傾向の把握、AIモデルの学習・評価に利用します。AI用データからメールアドレス等個人情報は除外します。</p>
      <div><a href="./terms.html" target="_blank" rel="noopener">利用規約</a><a href="./privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></div>
    </details>
  `;
}

function registrationSentMarkup() {
  const isSignup = registrationFeedback.mode === "signup";
  return `
    <section class="registration-sent">
      <span class="registration-sent-mark">#</span>
      <strong role="status">${isSignup ? "登録コード" : "ログインコード"}を送信しました</strong>
      <b>${escapeHtml(registrationFeedback.email)}</b>
      <p>メールを確認してこの画面に戻り、表示された認証コードを入力してください。</p>
      <label class="auth-code-field">
        <span>認証コード</span>
        <input name="cloudOtp" data-auth-otp inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" placeholder="12345678">
      </label>
      <button class="primary-button inline-action" type="button" data-verify-auth-code>認証して続ける</button>
      <small>届かない場合は、迷惑メールフォルダと入力したアドレスを確認してください。</small>
      <div class="auth-code-actions">
        <button type="button" data-resend-auth-code>コードを再送</button>
        <button type="button" data-reset-registration>メールアドレスを変更</button>
      </div>
    </section>
  `;
}

function syncChoiceMarkup(label, summary) {
  return `<div><strong>${label}</strong><span>${summary.decks}デッキ</span><span>${summary.sessions}大会</span><span>${summary.matches}試合</span></div>`;
}

function menuRowsMarkup() {
  if (adminPreview) {
    return `
      <button type="button" data-close-admin-preview>
        <span>管理者画面へ戻る</span>
        <small>${escapeHtml(adminPreview.username)}の記録を閲覧中</small>
        <b>›</b>
      </button>
      <div class="read-only-menu-note">閲覧専用のため、追加・編集・削除・同期操作はできません。</div>
    `;
  }
  const pageRow = route.name === "deckDetail"
    ? `<button type="button" data-open-menu-panel="deckSettings"><span>デッキ設定</span><small>名前・バージョン・アーカイブ</small><b>›</b></button>`
    : route.name === "session"
      ? `<button type="button" data-open-menu-panel="sessionSettings"><span>セッション設定</span><small>セッションの削除</small><b>›</b></button>`
      : "";
  const cloudText = cloudStatus.signedIn ? "ログイン中・同期設定" : cloudStatus.configured ? "未ログイン" : "未設定";
  const adminRow = accountContext.role === "superadmin"
    ? `<button type="button" data-open-admin><span>管理者画面</span><small>利用状況・全体傾向</small><b>›</b></button>`
    : "";
  return `
    ${pageRow}
    ${adminRow}
    <button type="button" data-open-guide><span>使い方</span><small>初回設定・大会中の記録・データ保護</small><b>›</b></button>
    <button type="button" data-open-menu-panel="releaseHistory"><span>更新履歴</span><small>機能追加・改善内容を確認</small><b>›</b></button>
    <button type="button" data-open-menu-panel="cloudSettings"><span>クラウド同期</span><small>${escapeHtml(cloudText)}</small><b>›</b></button>
    <button type="button" data-open-menu-panel="dataSettings"><span>環境・データ管理</span><small>環境、名称、バックアップ</small><b>›</b></button>
  `;
}

function dataSettingsMarkup() {
  const stores = uniqueValues(state.sessions.map((session) => session.name));
  const repairCount = buildRepairQueue(state).length;
  return `
    ${accountRecovery.preview ? `
      <button class="data-action-row recovery" type="button" data-open-account-recovery>
        <span><strong>端末内の未ログインデータ</strong><small>${accountRecovery.preview.anonymous.matches}試合が見つかっています</small></span><b>内容を確認</b>
      </button>
    ` : ""}
    ${repairCount ? `
      <button class="data-action-row" type="button" data-open-repair>
        <span><strong>未記録の項目を補完</strong><small>${repairCount}試合に未記録があります</small></span><b>開く</b>
      </button>
    ` : ""}
    ${environmentMasterMarkup()}
    ${dataSettingsMessage ? `<p class="cloud-message data-settings-message" role="status">${escapeHtml(dataSettingsMessage)}</p>` : ""}
    <details class="import-panel">
      <summary>相手デッキ名を統合</summary>
      <input type="hidden" name="mergeType" value="opponentDeck">
      <label>統合元<input name="mergeFrom" placeholder="表記揺れしている名称"></label>
      <label>統合先<input name="mergeTo" placeholder="今後使う正式名称"></label>
      <button class="primary-button inline-action" type="button" data-merge-names>名称を統合</button>
    </details>
    <details class="import-panel">
      <summary>プレイヤー名を一括編集</summary>
      <p class="form-note">全履歴のプレイヤー名から、最初の「さん」より後に続く文字だけを削除します。「さん」で終わる名前は変更しません。</p>
      <button class="primary-button inline-action" type="button" data-trim-player-honorific>変更内容を確認</button>
    </details>
    <details class="import-panel">
      <summary>店舗名を統合</summary>
      <label>統合元<select name="storeMergeFrom"><option value="">選択</option>${stores.map((store) => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join("")}</select></label>
      <label>統合先<input name="storeMergeTo" list="sessionNameSuggestions" placeholder="正式な店舗名"></label>
      <button class="primary-button inline-action" type="button" data-merge-stores>店舗名を統合</button>
    </details>
    <button class="primary-button inline-action ghost-action" type="button" data-copy-export>JSONをコピー</button>
    <details class="import-panel">
      <summary>JSONから復元</summary>
      <label>JSONデータ<textarea name="importJson" rows="5" placeholder="PCでコピーしたJSONを貼り付け"></textarea></label>
      <button class="primary-button inline-action" type="button" data-import-json>インポート</button>
    </details>
  `;
}

function playerNameTrimPreviewMarkup(preview) {
  const unchangedMatches = preview.totalMatches - preview.affectedMatches;
  return `
    <section class="batch-change-preview">
      <div class="batch-change-summary">
        <div><strong>${preview.affectedMatches}<small> / ${preview.totalMatches}</small></strong><span>試合の名前を変更</span></div>
        <div><strong>${preview.affectedNames}</strong><span>種類の名前が対象</span></div>
      </div>
      <div class="batch-change-assurance" role="note">
        <strong>試合データは削除されません</strong>
        <span>${unchangedMatches}試合は変更されず、以下のプレイヤー名だけを書き換えます。</span>
      </div>
      <div class="batch-change-list" aria-label="プレイヤー名の変更内容">
        ${preview.changes.map((change) => `
          <div class="batch-change-row">
            <div>
              <span>${escapeHtml(change.from)}</span>
              <b aria-hidden="true">→</b>
              <strong>${escapeHtml(change.to)}</strong>
            </div>
            <small>${change.matches}試合</small>
          </div>
        `).join("")}
      </div>
      <p class="form-note batch-change-warning">最初に現れる「さん」より後だけを削除し、「さん」は残します。内容を確認してから実行してください。</p>
      <button class="primary-button inline-action" type="button" data-confirm-trim-player-honorific>この内容で名前を変更</button>
    </section>
  `;
}

function environmentMasterMarkup() {
  const names = catalogEnvironmentOptions();
  if (!environmentCatalogReady) {
    const migrationMissing = environmentCatalogError.includes("environment_catalog")
      || environmentCatalogError.includes("get_admin_environment_catalog");
    return `
      <div class="environment-manager account-attention">
        <strong>環境マスターを読み込めません</strong>
        <span>${migrationMissing ? "管理者によるSupabaseの環境マスター設定が必要です。" : "通信状況を確認して、もう一度開いてください。"}</span>
      </div>
    `;
  }

  if (accountContext.role !== "superadmin") {
    return `
      <div class="environment-manager">
        <strong>選択できる環境</strong>
        <div class="environment-chip-list">${names.map((environment) => `<span>${escapeHtml(environment)}</span>`).join("") || "<span>未登録</span>"}</div>
        <span>環境は管理者が共通管理しています。</span>
      </div>
    `;
  }

  return `
    <div class="environment-manager">
      <strong>環境マスター</strong>
      <span>名称変更は全利用者の過去セッションにも反映されます。</span>
      ${environmentCatalogMessage ? `<p class="cloud-message" role="status">${escapeHtml(environmentCatalogMessage)}</p>` : ""}
      <div class="environment-admin-list">
        ${environmentCatalog.map((environment) => `
          <div class="environment-admin-row">
            <label>
              <span>${Number(environment.usage_count || 0)}セッション</span>
              <input name="environmentName-${environment.id}" value="${escapeHtml(environment.name)}" list="environmentSuggestions">
            </label>
            <button type="button" data-rename-environment="${environment.id}" data-current-environment="${escapeHtml(environment.name)}">変更</button>
            <button class="danger-button" type="button" data-delete-environment="${escapeHtml(environment.name)}" ${Number(environment.usage_count || 0) ? "disabled" : ""}>削除</button>
          </div>
        `).join("") || `<span>環境がまだ登録されていません。</span>`}
      </div>
      <label>環境を追加<input name="newEnvironment" maxlength="40" placeholder="例: 第10弾環境"></label>
      <button class="primary-button inline-action" type="button" data-add-environment>環境を追加</button>
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
        ${partnerColorChoices("deckPartnerColor", deck.partnerColor || "", "deck-settings")}
        ${caseCardPicker({
          inputName: "deckCaseCardName",
          selectedCaseCardId: deck.caseCardId || "",
          partnerColor: deck.partnerColor || "",
          scope: "deck-settings"
        })}
        <button class="primary-button inline-action" type="button" data-update-deck="${deck.id}">デッキ設定を更新</button>
        <button class="primary-button inline-action ghost-action" type="button" data-toggle-deck-archive="${deck.id}">${deck.archived ? "使用中に戻す" : "アーカイブする"}</button>
      </div>
      <div class="danger-zone">
        <strong>このデッキ</strong>
        <span>${sessionCount}セッション / ${matchCount}ラウンドが紐づいています。</span>
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
        <span>${matchCount}ラウンドが紐づいています。</span>
        <button class="danger-button" type="button" data-delete-current-session="${session.id}">セッションを削除</button>
      </div>
    `;
  }

  return "";
}
