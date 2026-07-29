export function scopedStorageKey(baseKey, userId = "") {
  return `${baseKey}:${userId ? `user:${userId}` : "anonymous"}`;
}

export function activateAnonymousStorage({ stateBaseKey, syncBaseKey }) {
  return {
    stateKey: scopedStorageKey(stateBaseKey),
    syncKey: scopedStorageKey(syncBaseKey),
    migrated: false
  };
}

export function readAnonymousStorage(storage, { stateBaseKey }) {
  return readAnonymousStorageSources(storage, { stateBaseKey })[0]?.state || null;
}

export function readAnonymousStorageSources(storage, { stateBaseKey }) {
  const keys = [scopedStorageKey(stateBaseKey), stateBaseKey];
  return keys.flatMap((key) => {
    const value = storage.getItem(key);
    if (!value) return [];
    try {
      return [{ key, state: JSON.parse(value) }];
    } catch {
      return [];
    }
  });
}

export function clearAnonymousStorage(storage, { stateBaseKey, syncBaseKey, legacyStateKey = "" }) {
  [
    scopedStorageKey(stateBaseKey),
    scopedStorageKey(syncBaseKey),
    stateBaseKey,
    syncBaseKey,
    legacyStateKey
  ].filter(Boolean).forEach((key) => storage.removeItem(key));
}

export function activateUserStorage(storage, { stateBaseKey, syncBaseKey, userId }) {
  const stateKey = scopedStorageKey(stateBaseKey, userId);
  const syncKey = scopedStorageKey(syncBaseKey, userId);
  return { stateKey, syncKey, migrated: false };
}
