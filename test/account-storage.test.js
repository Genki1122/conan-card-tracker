import test from "node:test";
import assert from "node:assert/strict";

import {
  activateAnonymousStorage,
  activateUserStorage,
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

test("the first signed-in user safely claims existing unscoped data once", () => {
  const storage = memoryStorage({
    "tracker-state": JSON.stringify({ decks: [{ id: "legacy" }] }),
    "tracker-sync": JSON.stringify({ dirty: true })
  });

  const activated = activateUserStorage(storage, {
    stateBaseKey: "tracker-state",
    syncBaseKey: "tracker-sync",
    userId: "user-a"
  });

  assert.equal(activated.migrated, true);
  assert.deepEqual(JSON.parse(storage.getItem(activated.stateKey)), { decks: [{ id: "legacy" }] });
  assert.deepEqual(JSON.parse(storage.getItem(activated.syncKey)), { dirty: true });
  assert.equal(storage.getItem("tracker-state"), null);
  assert.equal(storage.getItem("tracker-sync"), null);
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

test("anonymous records move into the account used to register", () => {
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

  assert.equal(activated.migrated, true);
  assert.deepEqual(JSON.parse(storage.getItem(activated.stateKey)), {
    decks: [{ id: "anonymous-deck" }]
  });
  assert.equal(storage.getItem(anonymous.stateKey), null);
});

test("claiming newer anonymous data also removes stale unscoped data", () => {
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

  assert.deepEqual(JSON.parse(storage.getItem(activated.stateKey)), {
    decks: [{ id: "latest" }]
  });
  assert.equal(storage.getItem("tracker-state"), null);
  assert.equal(storage.getItem("tracker-sync"), null);
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
