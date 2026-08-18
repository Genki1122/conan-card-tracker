import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("the app shell, release metadata, and authentication modules use one deployment version", async () => {
  const [indexHtml, appSource, serviceWorker, releaseMetadata] = await Promise.all([
    readFile(new URL("index.html", rootUrl), "utf8"),
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("sw.js", rootUrl), "utf8"),
    readFile(new URL("releases.json", rootUrl), "utf8").then(JSON.parse)
  ]);
  const appVersion = indexHtml.match(/src\/app\.js\?v=(\d+)/)?.[1];

  assert.ok(appVersion, "index.html must version the app module");
  assert.match(serviceWorker, new RegExp(`conan-card-tracker-v${appVersion}`));
  assert.match(serviceWorker, new RegExp(`src/app\\.js\\?v=${appVersion}`));
  assert.match(appSource, new RegExp(`const appVersion = "${appVersion}"`));
  assert.equal(releaseMetadata.currentVersion, appVersion);

  for (const moduleName of ["auth-challenge", "auth-feedback", "cloud"]) {
    assert.match(appSource, new RegExp(`\\./${moduleName}\\.js\\?v=${appVersion}`));
    assert.match(serviceWorker, new RegExp(`src/${moduleName}\\.js\\?v=${appVersion}`));
  }

  assert.match(serviceWorker, /src\/record-types\.js/);
  assert.match(serviceWorker, /src\/matchup-detail\.js/);
  assert.match(serviceWorker, /src\/release-notes\.js/);
  assert.match(serviceWorker, /releases\.json/);
});

test("the service worker bypasses the HTTP cache when checking for updates", async () => {
  const serviceWorker = await readFile(new URL("sw.js", rootUrl), "utf8");

  assert.match(serviceWorker, /fetch\(event\.request, \{ cache: "no-store" \}\)/);
});
