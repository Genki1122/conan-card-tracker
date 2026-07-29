import test from "node:test";
import assert from "node:assert/strict";

import {
  activateAnonymousStorage,
  activateUserStorage,
  clearAnonymousStorage,
  readAnonymousStorage,
  readAnonymousStorageSources,
  scopedStorageKey
} from "../src/account-storage.js";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

test("signing in keeps legacy anonymous data untouched for confirmed recovery", () => {
  const storage = memoryStorage({
    "tracker-state": JSON.stringify({ decks: [{ id: "legacy" }] }),
    "tracker-sync": JSON.stringify({ dirty: true })
  });

  const activated = activateUserStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-a"
  });

  assert.equal(activated.migrated, false);
  assert.equal(storage.getItem(activated.stateKey), null);
  assert.deepEqual(JSON.parse(storage.getItem("tracker-state")), { decks: [{ id: "legacy" }] });
  assert.deepEqual(JSON.parse(storage.getItem("tracker-sync")), { dirty: true });
});

test("a second account never receives another user's local data", () => {
  const storage = memoryStorage({
    [scopedStorageKey("tracker-state", "user-a")]: JSON.stringify({ decks: [{ id: "private-a" }] })
  });

  const activated = activateUserStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-b"
  });

  assert.equal(activated.migrated, false);
  assert.equal(storage.getItem(activated.stateKey), null);
  assert.deepEqual(JSON.parse(storage.getItem(scopedStorageKey("tracker-state", "user-a"))), {
    decks: [{ id: "private-a" }]
  });
});

test("anonymous records remain separate from the account until recovery succeeds", () => {
  const anonymous = activateAnonymousStorage({
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync"
  });
  const storage = memoryStorage({
    [anonymous.stateKey]: JSON.stringify({ decks: [{ id: "anonymous-deck" }] })
  });

  const activated = activateUserStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-a"
  });

  assert.equal(activated.migrated, false);
  assert.equal(storage.getItem(activated.stateKey), null);
  assert.deepEqual(JSON.parse(storage.getItem(anonymous.stateKey)), {
    decks: [{ id: "anonymous-deck" }]
  });
});

test("activation does not choose between multiple anonymous sources destructively", () => {
  const anonymous = activateAnonymousStorage({
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync"
  });
  const storage = memoryStorage({
    "tracker-state": JSON.stringify({ decks: [{ id: "stale" }] }),
    "tracker-sync": JSON.stringify({ dirty: false }),
    [anonymous.stateKey]: JSON.stringify({ decks: [{ id: "latest" }] }),
    [anonymous.syncKey]: JSON.stringify({ dirty: true })
  });

  const activated = activateUserStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-a"
  });

  assert.equal(storage.getItem(activated.stateKey), null);
  assert.deepEqual(JSON.parse(storage.getItem(anonymous.stateKey)), { decks: [{ id: "latest" }] });
  assert.deepEqual(JSON.parse(storage.getItem("tracker-state")), { decks: [{ id: "stale" }] });
  assert.deepEqual(JSON.parse(storage.getItem("tracker-sync")), { dirty: false });
});

test("logging out switches to a separate empty anonymous scope", () => {
  const user = activateUserStorage(memoryStorage(), {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-a"
  });
  const anonymous = activateAnonymousStorage({
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync"
  });

  assert.notEqual(user.stateKey, anonymous.stateKey);
  assert.equal(anonymous.stateKey, "tracker-state:anonymous");
});

test("reads retained anonymous data without modifying storage", () => {
  const storage = memoryStorage({
    "tracker-state:anonymous": JSON.stringify({ decks: [{ id: "anonymous" }] })
  });

  assert.deepEqual(readAnonymousStorage(storage, { stateBaseKey: "tracker-state" }), {
    decks: [{ id: "anonymous" }]
  });
  assert.notEqual(storage.getItem("tracker-state:anonymous"), null);
});

test("reads every valid anonymous source so recovery cannot silently discard one", () => {
  const storage = memoryStorage({
    "tracker-state:anonymous": JSON.stringify({ decks: [{ id: "scoped" }] }),
    "tracker-state": JSON.stringify({ decks: [{ id: "legacy" }] })
  });

  assert.deepEqual(
    readAnonymousStorageSources(storage, { stateBaseKey: "tracker-state" })
      .map((entry) => entry.state.decks[0].id),
    ["scoped", "legacy"]
  );
  assert.notEqual(storage.getItem("tracker-state:anonymous"), null);
  assert.notEqual(storage.getItem("tracker-state"), null);
});

test("clears anonymous and legacy values only after recovery succeeds", () => {
  const storage = memoryStorage({
    "tracker-state:anonymous": "{}",
    "tracker-sync:anonymous": "{}",
    "tracker-state": "{}",
    "tracker-sync": "{}",
    "old-match-list": "[]",
    "tracker-state:user:user-a": "{\"decks\":[{\"id\":\"private\"}]}"
  });

  clearAnonymousStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    legacyStateKey: "old-match-list"
  });

  assert.equal(storage.getItem("tracker-state:anonymous"), null);
  assert.equal(storage.getItem("tracker-sync:anonymous"), null);
  assert.equal(storage.getItem("tracker-state"), null);
  assert.equal(storage.getItem("tracker-sync"), null);
  assert.equal(storage.getItem("old-match-list"), null);
  assert.notEqual(storage.getItem("tracker-state:user:user-a"), null);
});
