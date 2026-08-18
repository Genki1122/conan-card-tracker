import assert from "node:assert/strict";
import test from "node:test";

import {
  latestRelease,
  markReleaseSeen,
  normalizeReleaseManifest,
  readSeenReleaseVersion,
  releaseForVersion,
  unseenRelease
} from "../src/release-notes.js";

const manifest = normalizeReleaseManifest({
  currentVersion: "54",
  releases: [
    {
      version: "53",
      releasedAt: "2026-08-13",
      title: "前回の更新",
      summary: "以前の変更です",
      items: ["変更A"]
    },
    {
      version: "54",
      releasedAt: "2026-08-18",
      title: "今回の更新",
      summary: "振り返りとX投稿を改善しました",
      items: ["変更1", "", 42, "変更2"]
    },
    { version: "", title: "不正な更新" },
    null
  ]
});

test("normalizes release metadata and discards malformed entries", () => {
  assert.equal(manifest.currentVersion, "54");
  assert.equal(manifest.releases.length, 2);
  assert.deepEqual(manifest.releases[0].items, ["変更1", "変更2"]);
});

test("finds the current and requested release", () => {
  assert.equal(latestRelease(manifest)?.version, "54");
  assert.equal(releaseForVersion(manifest, "53")?.title, "前回の更新");
  assert.equal(releaseForVersion(manifest, "99"), null);
});

test("returns only an unseen release for the running app version", () => {
  assert.equal(unseenRelease(manifest, "", "54")?.version, "54");
  assert.equal(unseenRelease(manifest, "54", "54"), null);
  assert.equal(unseenRelease(manifest, "53", "54")?.version, "54");
  assert.equal(unseenRelease(manifest, "53", "55"), null);
});

test("reads and writes the seen version without throwing on unavailable storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(readSeenReleaseVersion(storage), "");
  assert.equal(markReleaseSeen(storage, "54"), true);
  assert.equal(readSeenReleaseVersion(storage), "54");
  assert.equal(readSeenReleaseVersion({ getItem() { throw new Error("blocked"); } }), "");
  assert.equal(markReleaseSeen({ setItem() { throw new Error("blocked"); } }, "54"), false);
});
