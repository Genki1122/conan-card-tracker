import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Isolated records and cloud stubs: never use a real account for update tests.
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("src/app.js", root), "utf8");
const version = source.match(/const appVersion = "(\d+)"/)[1];
const futureVersion = String(Number(version) + 1);
const oldCommit = "724e2a75d08f5914b5fd34184e08ba42975f8e17";
const oldFiles = Object.fromEntries(["src/app.js", "index.html", "sw.js"].map(path => [path,
  execFileSync("git", ["show", `${oldCommit}:${path}`], {cwd:fileURLToPath(root),encoding:"utf8"})
]));
const cloud = await readFile(new URL("src/cloud.js", root), "utf8");
const mocks = {
  isCloudConfigured: "() => false",
  getCloudConfig: '() => ({url:"",anonKey:""})',
  cloudSnapshot: '() => ({configured:false,signedIn:false})',
  initializeCloud: 'async () => ({configured:false,signedIn:false})'
};
const cloudMock = [...cloud.matchAll(/^export (?:async )?function (\w+)/gm)]
  .map(([,name]) => `export const ${name} = ${mocks[name] || "async () => []"};`).join("\n");
const hooks = `
window.updateTest = {
  version: appVersion, banner: showUpdateBanner, announce: initializeReleaseNotes,
  menu: () => openDialog("menu")
};`;
const release = value => ({version:value,releasedAt:"2026-10-15",title:`更新テスト v${value}`,summary:"更新表示の確認",items:["記録は保持されます"]});
let deployment = "current";
let advertisedVersion = version;
let failMetadata = false;
let dropMetadata = false;
let scheduledAt = "";
let metadataRequests = 0;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const relative = path === "/" ? "index.html" : path.slice(1);
    const file = new URL(relative, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    if (relative === "releases.json") {
      metadataRequests++;
      if (dropMetadata) { request.socket.destroy(); return; }
      if (failMetadata) { response.writeHead(503).end("Offline test"); return; }
      response.writeHead(200, {"Content-Type":"application/json","Cache-Control":"no-store"})
        .end(JSON.stringify({currentVersion:advertisedVersion,releases:[
          {...release(advertisedVersion),availableAt:scheduledAt},
          ...(scheduledAt ? [release(version)] : [])
        ]}));
      return;
    }
    let body = relative === "src/cloud.js" ? cloudMock
      : deployment === "old" && oldFiles[relative] ? oldFiles[relative] : await readFile(file);
    if (deployment === "future" && ["src/app.js", "index.html", "sw.js"].includes(relative)) {
      body = String(body).replaceAll(`?v=${version}`, `?v=${futureVersion}`)
        .replace(`const appVersion = "${version}"`, `const appVersion = "${futureVersion}"`)
        .replace(`tracker-v${version}`, `tracker-v${futureVersion}`);
    }
    if (relative === "src/app.js") body = String(body) + hooks;
    const type = relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".png") ? "image/png" : "text/html";
    response.writeHead(200, {"Content-Type":type,"Cache-Control":"no-store"}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let passed = 0;

async function run(browser, engine, name, check, {realWorker=false,old=false}={}) {
  deployment = old ? "old" : "current";
  advertisedVersion = old ? "57" : version;
  failMetadata = false;
  dropMetadata = false;
  scheduledAt = "";
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:realWorker ? "allow" : "block"});
  await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await context.addInitScript(({seen,realWorker}) => {
    if (!localStorage.getItem("conan-card-tracker-release-seen-v1")) localStorage.setItem("conan-card-tracker-release-seen-v1", seen);
    if (!localStorage.getItem("conan-card-tracker-v2:anonymous")) {
      localStorage.setItem("conan-card-tracker-v2:anonymous", JSON.stringify({
        decks:[{id:"preserve-deck",name:"更新検証デッキ",version:"v1"}],
        sessions:[{id:"preserve-session",deckId:"preserve-deck",name:"検証大会",date:"2026-10-15"}],
        matches:[{id:"preserve-match",sessionId:"preserve-session",result:"win",myPassed:"pass23"}],environments:[]
      }));
      localStorage.setItem("update-test-sentinel", "retained");
    }
    if (!realWorker) {
      const worker = new EventTarget();
      worker.controller = {};
      worker.register = async () => {
        const registration = new EventTarget();
        registration.waiting = null;
        registration.update = async () => worker.dispatchEvent(new Event("controllerchange"));
        return registration;
      };
      Object.defineProperty(navigator, "serviceWorker", {value:worker,configurable:true});
    }
  }, {seen:advertisedVersion,realWorker});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.updateTest);
    await check(page);
    assert.deepEqual(errors, []);
    const retained = await page.evaluate(() => ({
      data:JSON.parse(localStorage.getItem("conan-card-tracker-v2:anonymous")),
      sentinel:localStorage.getItem("update-test-sentinel")
    }));
    assert.equal(retained.sentinel, "retained");
    assert.equal(retained.data.matches[0].id, "preserve-match");
    assert.equal(retained.data.matches[0].myPassed, "pass23");
    passed++;
    console.log(`PASS ${engine}: ${name}`);
  } catch (error) {
    console.error({name,errors,state:await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration?.();
      return {version:window.updateTest?.version,banner:!document.querySelector("#updateBanner").hidden,
        controller:navigator.serviceWorker.controller?.state,installing:registration?.installing?.state,
        active:registration?.active?.state,waiting:registration?.waiting?.state};
    })});
    await page.screenshot({path:`/tmp/update-banner-${engine}-failure.png`});
    throw error;
  } finally { await context.close(); }
}

async function refresh(page) { await page.evaluate(() => updateTest.banner()); }
async function closeDialog(page) { await page.locator('button[value="cancel"]').click(); }
async function apply(page, targetVersion) {
  const navigation = page.waitForNavigation();
  await page.locator("#applyUpdateButton").click();
  await navigation;
  await page.waitForFunction(value => window.updateTest?.version === value, targetVersion);
}

try {
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await type.launch({headless:true});
    try {
      await run(browser, engine, "same-version worker events stay hidden even after reloading", async page => {
        for (let i=0; i<3; i++) {
          await refresh(page);
          assert.equal(await page.locator("#updateBanner").isVisible(), false);
          assert.equal(await page.locator(".phone-shell").evaluate(node => node.classList.contains("update-available")), false);
          await page.reload();
          await page.waitForFunction(() => window.updateTest);
        }
      });
      await run(browser, engine, "reading a deferred announcement hides it without an update button", async page => {
        await page.evaluate(value => localStorage.setItem("conan-card-tracker-release-seen-v1", value), String(Number(version)-1));
        await page.evaluate(() => { updateTest.menu(); });
        await page.evaluate(() => updateTest.announce());
        assert.equal(await page.locator("#updateBanner").isVisible(), true);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), false);
        await closeDialog(page);
        await page.locator("#showUpdateDetailsButton").click();
        await closeDialog(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "metadata refresh finds a new deployment and reading notes does not apply it", async page => {
        await refresh(page);
        const requestsBefore = metadataRequests;
        advertisedVersion = futureVersion;
        await refresh(page);
        assert.ok(metadataRequests > requestsBefore);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), true);
        await page.locator("#showUpdateDetailsButton").click();
        await closeDialog(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), true);
        deployment = "future";
        await apply(page, futureVersion);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "metadata failure keeps records and allows retry instead of reload looping", async page => {
        advertisedVersion = futureVersion;
        await refresh(page);
        failMetadata = true;
        await page.locator("#applyUpdateButton").click();
        await page.waitForFunction(() => document.querySelector("#updateBannerSummary").textContent.includes("再試行"));
        assert.equal(await page.evaluate(() => updateTest.version), version);
        assert.equal(await page.locator("#applyUpdateButton").isEnabled(), true);
        failMetadata = false;
        deployment = "future";
        await apply(page, futureVersion);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "older metadata cannot announce a downgrade", async page => {
        advertisedVersion = String(Number(version)-1);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "a deployment cannot reveal or mark scheduled notes read early", async page => {
        advertisedVersion = futureVersion;
        scheduledAt = "2099-01-01T00:00:00Z";
        await refresh(page);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), true);
        assert.doesNotMatch(await page.locator("#updateBannerTitle").textContent(), new RegExp(`v${futureVersion}`));
        await page.locator("#showUpdateDetailsButton").click();
        assert.doesNotMatch(await page.locator("#entryDialog").textContent(), new RegExp(`v${futureVersion}`));
        assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-seen-v1")), version);
        await closeDialog(page);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), true);
      });
      await run(browser, engine, "an offline worker cache is not treated as a successful update check", async page => {
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        advertisedVersion = futureVersion;
        await refresh(page);
        await page.waitForFunction(async value => {
          const cached = await caches.match("./releases.json");
          return cached && (await cached.json()).currentVersion === value;
        }, futureVersion);
        dropMetadata = true;
        await page.evaluate(() => { window.updatePageRetained = true; });
        await page.locator("#applyUpdateButton").click();
        await page.waitForFunction(() => document.querySelector("#updateBannerSummary").textContent.includes("再試行"), null, {timeout:5000});
        assert.equal(await page.evaluate(() => window.updatePageRetained), true);
        assert.equal(await page.locator("#applyUpdateButton").isEnabled(), true);
        dropMetadata = false;
        deployment = "future";
        await apply(page, futureVersion);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      }, {realWorker:true});
      await run(browser, engine, "real service worker upgrades published v57 and preserves records", async page => {
        assert.notEqual(version, "57", "The fix must have a new deployment version");
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        await page.reload();
        await page.waitForFunction(() => window.updateTest?.version === "57" && Boolean(navigator.serviceWorker.controller));
        deployment = "current";
        advertisedVersion = version;
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
        await page.waitForFunction(() => !document.querySelector("#updateBanner").hidden);
        await apply(page, version);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        if (await page.locator("#entryDialog").isVisible()) await closeDialog(page);
        await page.reload();
        await page.waitForFunction(value => window.updateTest?.version === value, version);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await page.screenshot({path:`/tmp/update-banner-${engine}-upgraded.png`});
      }, {realWorker:true,old:true});
    } finally { await browser.close(); }
  }
  console.log(`${passed} update scenarios passed`);
} finally { await new Promise(resolve => server.close(resolve)); }
