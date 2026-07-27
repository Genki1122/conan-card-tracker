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

export function activateUserStorage(storage, { stateBaseKey, syncBaseKey, userId }) {
  const stateKey = scopedStorageKey(stateBaseKey, userId);
  const syncKey = scopedStorageKey(syncBaseKey, userId);
  if (storage.getItem(stateKey)) return { stateKey, syncKey, migrated: false };

  const anonymous = activateAnonymousStorage({ stateBaseKey, syncBaseKey });
  const sourceStateKey = storage.getItem(anonymous.stateKey)
    ? anonymous.stateKey
    : storage.getItem(stateBaseKey)
      ? stateBaseKey
      : "";
  if (!sourceStateKey) return { stateKey, syncKey, migrated: false };

  const sourceSyncKey = sourceStateKey === stateBaseKey ? syncBaseKey : anonymous.syncKey;
  storage.setItem(stateKey, storage.getItem(sourceStateKey));
  const syncValue = storage.getItem(sourceSyncKey);
  if (syncValue) storage.setItem(syncKey, syncValue);
  storage.removeItem(sourceStateKey);
  storage.removeItem(sourceSyncKey);
  storage.removeItem(stateBaseKey);
  storage.removeItem(syncBaseKey);
  return { stateKey, syncKey, migrated: true };
}
