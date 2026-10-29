import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeReleaseManifest, releaseForVersion, unseenAvailableRelease } from "../src/release-notes.js";

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

  assert.match(appSource, /fetch\(url, \{ cache: "no-store" \}\)/);
  assert.match(appSource, /requestMetadata\("\.\/releases\.json"\)/);
  assert.match(appSource, /function showUpdateBanner/);
  assert.match(appSource, /updateBannerTitle\.textContent = release\?\.title \|\| "新しいお知らせがあります"/);
  assert.match(appSource, /updateBannerSummary\.textContent = updateMessage \|\| release\?\.summary/);
});

test("the shared sheet renders concise release details", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /mode === "releaseNotes"/);
  assert.match(appSource, /function releaseDetailsMarkup/);
  assert.match(appSource, /release\.items\.slice\(0, 4\)/);
  assert.match(appSource, /お知らせを取得できませんでした/);
});

test("startup uses the latest unread banner without opening a detail", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /const appVersion = "60"/);
  assert.match(appSource, /async function initializeReleaseNotes/);
  assert.match(appSource, /unreadBannerRelease\(releaseManifest, releaseReadState\)/);
  const initializer = appSource.split("async function initializeReleaseNotes()")[1].split("function scheduleNextReleaseAnnouncement")[0];
  assert.doesNotMatch(initializer, /openDialog|markReleaseRead/);
  assert.match(appSource, /scheduleNextReleaseAnnouncement\(manifest\)/);
});

test("the pass picker release remains in history and its modules stay cached", async () => {
  const manifest = normalizeReleaseManifest(JSON.parse(await readFile(new URL("releases.json", rootUrl), "utf8")));
  const release = releaseForVersion(manifest, "57");
  assert.equal(release?.version, "57");
  assert.equal(release?.title, "パスを番号で複数選択できるようになりました");
  assert.ok(release.items.some(item => item.includes("2&3パス")));
  assert.ok(release.items.some(item => item.includes("X投稿")));
  assert.doesNotMatch(JSON.stringify(release), /管理者|プレビュー/);
  const index = await readFile(new URL("index.html", rootUrl), "utf8");
  const worker = await readFile(new URL("sw.js", rootUrl), "utf8");
  assert.match(index, /src="\.\/src\/app\.js\?v=60"/);
  assert.match(worker, /const CACHE_NAME = "conan-card-tracker-v60"/);
  assert.ok(worker.includes('"./src/app.js?v=60"'));
  assert.ok(worker.includes('"./src/pass-selection.js"'));
  assert.ok(worker.includes('"./src/feature-releases.js"'));
});

test("the card catalog has a current announcement and preserves notice history", async () => {
  const manifest = normalizeReleaseManifest(JSON.parse(await readFile(new URL("releases.json", rootUrl), "utf8")));
  assert.equal(manifest.currentVersion, "60");
  const release = unseenAvailableRelease(manifest, "59");
  assert.equal(release?.version, "60");
  assert.match(release?.title, /月下のSHOW TIME!/);
  assert.equal(unseenAvailableRelease(manifest, "60"), null);
  assert.match(releaseForVersion(manifest, "59")?.title, /お知らせ/);
  assert.equal(releaseForVersion(manifest, "58")?.title, "更新案内が残る不具合を修正");
  const worker = await readFile(new URL("sw.js", rootUrl), "utf8");
  assert.ok(worker.includes('"./src/card-catalog.js"'));
});

test("the menu exposes notices without marking the list read", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /data-open-menu-panel="releaseHistory"/);
  assert.match(appSource, /mode === "releaseHistory"/);
  assert.match(appSource, /function releaseHistoryMarkup/);
  assert.match(appSource, /<span>お知らせ<\/span>/);
  assert.match(appSource, /data-open-release=/);
  assert.match(appSource, /data-release-unread/);
  assert.match(appSource, /function finishReleaseReading/);
  assert.match(appSource, /data-apply-update/);
  assert.doesNotMatch(appSource, /markReleaseSeen\(/);
  assert.match(styles, /\.release-history/);
});
