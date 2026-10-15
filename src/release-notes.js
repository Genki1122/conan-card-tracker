export const releaseSeenStorageKey = "conan-card-tracker-release-seen-v1";
export const releaseReadStorageKey = "conan-card-tracker-release-read-v2";

export function loadReleaseReadState(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(releaseReadStorageKey) || "null");
    if (saved && Array.isArray(saved.versions)) {
      return { legacyThrough: cleanText(saved.legacyThrough), versions: saved.versions.map(cleanText).filter(Boolean) };
    }
  } catch {
    // Fall back to the legacy read baseline without touching any record data.
  }
  return { legacyThrough: readSeenReleaseVersion(storage), versions: [] };
}

export function isReleaseRead(state = {}, version = "") {
  const target = cleanText(version);
  if (!target) return false;
  return Boolean(state.versions?.includes(target) || (state.legacyThrough
    && target.localeCompare(state.legacyThrough, undefined, { numeric: true }) <= 0));
}

export function markReleaseRead(storage, state, version) {
  const target = cleanText(version);
  if (!target) return state;
  const saved = loadReleaseReadState(storage);
  const next = {
    legacyThrough: state.legacyThrough || saved.legacyThrough,
    versions: [...new Set([...saved.versions, ...state.versions, target])]
  };
  try {
    storage?.setItem(releaseReadStorageKey, JSON.stringify(next));
  } catch {
    // Keep the read state in memory when browser storage is unavailable.
  }
  return next;
}

export function unreadBannerRelease(manifest, readState, now = new Date()) {
  const latest = latestAvailableRelease(manifest, now);
  if (!latest || isReleaseRead(readState, latest.version)) return null;
  // Stale metadata must not promote an older unread notice back into the banner.
  const newerRead = readState.versions.some((version) => version.localeCompare(latest.version, undefined, { numeric: true }) > 0);
  return newerRead ? null : latest;
}

export function normalizeReleaseManifest(payload = {}) {
  const releases = Array.isArray(payload?.releases)
    ? payload.releases.map(normalizeRelease).filter(Boolean).sort(compareReleases)
    : [];
  return {
    currentVersion: cleanText(payload?.currentVersion),
    releases
  };
}

export function latestRelease(manifest = {}) {
  return releaseForVersion(manifest, manifest.currentVersion) || manifest.releases?.[0] || null;
}

export function latestAvailableRelease(manifest = {}, now = new Date()) {
  return availableReleases(manifest, now)[0] || null;
}

export function availableReleases(manifest = {}, now = new Date()) {
  const nowTime = toTime(now);
  return Array.isArray(manifest.releases)
    ? manifest.releases.filter((release) => releaseAvailableAt(release) <= nowTime)
    : [];
}

export function nextScheduledRelease(manifest = {}, now = new Date()) {
  const nowTime = toTime(now);
  return (Array.isArray(manifest.releases) ? manifest.releases : [])
    .filter((release) => release.availableAt && releaseAvailableAt(release) > nowTime)
    .sort((left, right) => releaseAvailableAt(left) - releaseAvailableAt(right))[0] || null;
}

export function releaseForVersion(manifest = {}, version = "") {
  const target = cleanText(version);
  if (!target || !Array.isArray(manifest.releases)) return null;
  return manifest.releases.find((release) => release.version === target) || null;
}

export function unseenRelease(manifest = {}, seenVersion = "", runningVersion = "") {
  const release = releaseForVersion(manifest, runningVersion);
  return release && release.version !== cleanText(seenVersion) ? release : null;
}

export function unseenAvailableRelease(manifest = {}, seenVersion = "", now = new Date()) {
  const release = latestAvailableRelease(manifest, now);
  const seen = cleanText(seenVersion);
  return release && (!seen || release.version.localeCompare(seen, undefined, { numeric: true }) > 0) ? release : null;
}

export function isAppUpdateAvailable(manifest = {}, runningVersion = "") {
  const current = cleanText(manifest.currentVersion);
  const running = cleanText(runningVersion);
  return /^\d+$/.test(current) && /^\d+$/.test(running)
    && current.localeCompare(running, undefined, { numeric: true }) > 0;
}

export function readSeenReleaseVersion(storage) {
  try {
    return cleanText(storage?.getItem(releaseSeenStorageKey));
  } catch {
    return "";
  }
}

export function markReleaseSeen(storage, version) {
  const normalizedVersion = cleanText(version);
  if (!normalizedVersion) return false;
  try {
    storage?.setItem(releaseSeenStorageKey, normalizedVersion);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelease(value) {
  if (!value || typeof value !== "object") return null;
  const version = cleanText(value.version);
  const title = cleanText(value.title);
  if (!version || !title) return null;
  return {
    version,
    releasedAt: cleanText(value.releasedAt),
    availableAt: cleanText(value.availableAt),
    title,
    summary: cleanText(value.summary),
    items: Array.isArray(value.items) ? value.items.map(cleanText).filter(Boolean) : []
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareReleases(left, right) {
  const dateOrder = right.releasedAt.localeCompare(left.releasedAt);
  if (dateOrder) return dateOrder;
  return right.version.localeCompare(left.version, undefined, { numeric: true });
}

function releaseAvailableAt(release) {
  if (!release.availableAt) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(release.availableAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function toTime(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Date.now();
}
