import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeReleaseManifest, unseenAvailableRelease } from "../src/release-notes.js";

const rootUrl = new URL("../", import.meta.url);

test("the update banner shows a compact summary with details and update actions", async () => {
  const [indexHtml, styles] = await Promise.all([
    readFile(new URL("index.html", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(indexHtml, /id="updateBannerTitle"/);
  assert.match(indexHtml, /id="updateBannerSummary"/);
  assert.match(indexHtml, /id="showUpdateDetailsButton"[^>]*>内容</);
  assert.match(indexHtml, /id="applyUpdateButton"[^>]*>更新</);
  assert.match(styles, /\.update-banner-copy/);
  assert.match(styles, /\.update-banner-summary[^}]*text-overflow: ellipsis/s);
  assert.match(styles, /\.update-banner-actions/);
});

test("release metadata enriches the banner without blocking a generic fallback", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /fetch\("\.\/releases\.json", \{ cache: "no-store" \}\)/);
  assert.match(appSource, /function showUpdateBanner/);
  assert.match(appSource, /updateBannerTitle\.textContent = release\?\.title \|\| "新しい更新があります"/);
  assert.match(appSource, /updateBannerSummary\.textContent = release\?\.summary \|\| "更新内容を確認して反映できます"/);
});

test("the shared sheet renders concise release details", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /mode === "releaseNotes"/);
  assert.match(appSource, /function releaseDetailsMarkup/);
  assert.match(appSource, /release\.items\.slice\(0, 4\)/);
  assert.match(appSource, /更新情報を取得できませんでした/);
});

test("the latest available release is announced only when it is unseen", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /const appVersion = "57"/);
  assert.match(appSource, /async function initializeReleaseNotes/);
  assert.match(appSource, /unseenAvailableRelease\(manifest, readSeenReleaseVersion\(localStorage\)\)/);
  assert.match(appSource, /if \(dialog\.open \|\| accountOnboardingActive\)/);
  assert.match(appSource, /openDialog\("releaseNotes", release\.version\);\s*markReleaseSeen\(localStorage, release\.version\);/);
  assert.match(appSource, /scheduleNextReleaseAnnouncement\(manifest\)/);
});

test("the public pass picker release is announced and its modules are cached", async () => {
  const manifest = normalizeReleaseManifest(JSON.parse(await readFile(new URL("releases.json", rootUrl), "utf8")));
  const release = unseenAvailableRelease(manifest, "56");
  assert.equal(manifest.currentVersion, "57");
  assert.equal(release?.version, "57");
  assert.equal(release?.title, "パスを番号で複数選択できるようになりました");
  assert.ok(release.items.some(item => item.includes("2&3パス")));
  assert.ok(release.items.some(item => item.includes("X投稿")));
  assert.equal(unseenAvailableRelease(manifest, "57"), null);
  assert.doesNotMatch(JSON.stringify(release), /管理者|プレビュー/);
  const index = await readFile(new URL("index.html", rootUrl), "utf8");
  const worker = await readFile(new URL("sw.js", rootUrl), "utf8");
  assert.match(index, /src="\.\/src\/app\.js\?v=57"/);
  assert.match(worker, /const CACHE_NAME = "conan-card-tracker-v57"/);
  assert.ok(worker.includes('"./src/app.js?v=57"'));
  assert.ok(worker.includes('"./src/pass-selection.js"'));
  assert.ok(worker.includes('"./src/feature-releases.js"'));
});

test("the three-dot menu keeps a route to release history", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /data-open-menu-panel="releaseHistory"/);
  assert.match(appSource, /mode === "releaseHistory"/);
  assert.match(appSource, /function releaseHistoryMarkup/);
  assert.match(appSource, /更新履歴/);
  assert.match(appSource, /const currentRelease = latestAvailableRelease\(releaseManifest\)/);
  assert.match(appSource, /markReleaseSeen\(localStorage, currentRelease\.version\)/);
  assert.match(styles, /\.release-history/);
});
