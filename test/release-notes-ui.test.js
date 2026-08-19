import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("the running release is shown automatically only when it is unseen", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /const appVersion = "55"/);
  assert.match(appSource, /async function initializeReleaseNotes/);
  assert.match(appSource, /unseenRelease\(manifest, readSeenReleaseVersion\(localStorage\), appVersion\)/);
  assert.match(appSource, /if \(!release \|\| dialog\.open \|\| accountOnboardingActive\) return/);
  assert.match(appSource, /openDialog\("releaseNotes", release\.version\);\s*markReleaseSeen\(localStorage, release\.version\);/);
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
  assert.match(styles, /\.release-history/);
});
