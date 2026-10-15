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
const publishedNotices = JSON.parse(await readFile(new URL("releases.json", root), "utf8"));
const currentNotice = publishedNotices.releases.find(entry => entry.version === version);
const futureVersion = String(Number(version) + 1);
const oldCommit = "7159b18cbef144ca90a321bb24887d9ad3fbe198";
const oldFiles = Object.fromEntries(["src/app.js", "index.html", "sw.js"].map(path => [path,
  execFileSync("git", ["show", `${oldCommit}:${path}`], {cwd:fileURLToPath(root),encoding:"utf8"})
]));
const oldVersion = oldFiles["src/app.js"].match(/const appVersion = "(\d+)"/)[1];
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
  menu: () => openDialog("menu"), detail: value => openDialog("releaseNotes", value)
};`;
const release = value => value === version ? currentNotice
  : {version:value,releasedAt:"2026-10-15",title:`更新テスト v${value}`,summary:"更新表示の確認",items:["記録は保持されます"]};
let deployment = "current";
let advertisedVersion = version;
let failMetadata = false;
let dropMetadata = false;
let scheduledAt = "";
let extraReleases = [];
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
          ...(scheduledAt ? [release(version)] : []), ...extraReleases
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

async function run(browser, engine, name, check, {realWorker=false,old=false,unread=false,width=390}={}) {
  deployment = old ? "old" : "current";
  advertisedVersion = old ? oldVersion : version;
  failMetadata = false;
  dropMetadata = false;
  scheduledAt = "";
  extraReleases = [];
  const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:realWorker ? "allow" : "block"});
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
  }, {seen:unread ? String(Number(advertisedVersion)-1) : advertisedVersion,realWorker});
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
async function closeDialog(page) {
  await page.locator('button[value="cancel"]').click();
  await page.waitForFunction(() => !document.querySelector("#entryDialog").open);
}
async function openMenu(page) { await page.locator("#moreButton").click(); }
async function openNotices(page) {
  await openMenu(page);
  await page.locator('[data-open-menu-panel="releaseHistory"]').click();
  await page.locator(".release-history").waitFor();
}
async function readBanner(page) {
  await page.locator("#showUpdateDetailsButton").click();
  await page.locator(".release-details").waitFor();
  await closeDialog(page);
  await page.waitForFunction(() => document.querySelector("#updateBanner").hidden);
}
async function apply(page, targetVersion, selector="#applyUpdateButton") {
  const navigation = page.waitForNavigation();
  await page.locator(selector).click();
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
      await run(browser, engine, "startup shows a banner but never automatically opens the detail", async page => {
        await refresh(page);
        assert.equal(await page.locator("#entryDialog").isVisible(), false);
        assert.equal(await page.locator("#updateBanner").isVisible(), true);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), false);
        await page.locator("#showUpdateDetailsButton").click();
        assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-read-v2")), null);
        await closeDialog(page);
        await page.waitForFunction(() => document.querySelector("#updateBanner").hidden);
        await page.reload();
        await page.waitForFunction(() => window.updateTest);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      }, {unread:true});
      await run(browser, engine, "reading a notice hides the banner but leaves updates in the menu", async page => {
        await refresh(page);
        const requestsBefore = metadataRequests;
        advertisedVersion = futureVersion;
        await refresh(page);
        assert.ok(metadataRequests > requestsBefore);
        assert.equal(await page.locator("#applyUpdateButton").isVisible(), true);
        await readBanner(page);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await page.reload();
        await page.waitForFunction(() => window.updateTest);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await openMenu(page);
        assert.equal(await page.locator("[data-apply-update]").isVisible(), true);
        deployment = "future";
        await apply(page, futureVersion, "[data-apply-update]");
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
        await readBanner(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "menu update failures stay in the menu without reviving a read banner", async page => {
        advertisedVersion = futureVersion;
        await refresh(page);
        await readBanner(page);
        await openNotices(page);
        failMetadata = true;
        await page.locator("[data-apply-update]").click();
        await page.waitForFunction(() => document.querySelector("[data-update-status]").textContent.includes("再試行"));
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        assert.equal(await page.locator("[data-apply-update]").isEnabled(), true);
        assert.equal(await page.evaluate(() => updateTest.version), version);
        await page.screenshot({path:`/tmp/notice-center-${engine}-update-retry.png`});
        failMetadata = false;
        deployment = "future";
        await apply(page, futureVersion, "[data-apply-update]");
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      }, {width:320});
      await run(browser, engine, "older metadata cannot announce a downgrade", async page => {
        advertisedVersion = String(Number(version)-1);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "a deployment cannot reveal or mark scheduled notes read early", async page => {
        advertisedVersion = futureVersion;
        scheduledAt = "2099-01-01T00:00:00Z";
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await openNotices(page);
        assert.equal(await page.locator("[data-apply-update]").isVisible(), true);
        assert.doesNotMatch(await page.locator("#entryDialog").textContent(), new RegExp(`v${futureVersion}`));
        assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-seen-v1")), version);
        await closeDialog(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      });
      await run(browser, engine, "scheduled notices become a banner at release time without a popup", async page => {
        advertisedVersion = futureVersion;
        scheduledAt = "2030-01-01T00:01:00Z";
        await page.clock.install({time:new Date("2030-01-01T00:00:00Z")});
        await page.reload();
        await page.waitForFunction(() => window.updateTest);
        await page.evaluate(() => updateTest.announce());
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await page.clock.fastForward(61000);
        await page.waitForFunction(() => !document.querySelector("#updateBanner").hidden);
        assert.equal(await page.locator("#entryDialog").isVisible(), false);
        await readBanner(page);
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
        await readBanner(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
      }, {realWorker:true});
      await run(browser, engine, "real service worker upgrades the previous release and preserves records", async page => {
        assert.notEqual(version, oldVersion, "The feature must have a new deployment version");
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        await page.reload();
        await page.waitForFunction(value => window.updateTest?.version === value && Boolean(navigator.serviceWorker.controller), oldVersion);
        deployment = "current";
        advertisedVersion = version;
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
        await page.waitForFunction(() => !document.querySelector("#updateBanner").hidden);
        await apply(page, version);
        await refresh(page);
        assert.equal(await page.locator("#entryDialog").isVisible(), false);
        await readBanner(page);
        await page.reload();
        await page.waitForFunction(value => window.updateTest?.version === value, version);
        await refresh(page);
        assert.equal(await page.locator("#updateBanner").isVisible(), false);
        await page.screenshot({path:`/tmp/update-banner-${engine}-upgraded.png`});
      }, {realWorker:true,old:true});
      for (const width of [320,390,1024]) {
        await run(browser, engine, `notice list marks only opened details read and fits ${width}px`, async page => {
          extraReleases = [release(String(Number(version)-1)), release(String(Number(version)-2))];
          await page.evaluate(() => {
            localStorage.removeItem("conan-card-tracker-release-read-v2");
            localStorage.setItem("conan-card-tracker-release-seen-v1", "1");
          });
          await page.reload();
          await page.waitForFunction(() => window.updateTest);
          await openNotices(page);
          assert.equal(await page.locator("#dialogTitle").textContent(), "お知らせ");
          assert.equal(await page.locator("[data-release-unread]").count(), 3);
          assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-read-v2")), null);
          await page.locator(`[data-open-release="${version}"]`).click();
          assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-read-v2")), null);
          await page.locator('[data-open-menu-panel="releaseHistory"]').click();
          await page.locator(".release-history").waitFor();
          assert.equal(await page.locator("[data-release-unread]").count(), 2);
          assert.equal(await page.locator("#updateBanner").isVisible(), false);
          await page.locator(`[data-open-release="${Number(version)-2}"]`).click();
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !document.querySelector("#entryDialog").open);
          await openNotices(page);
          assert.equal(await page.locator("[data-release-unread]").count(), 1);
          const overflow = await page.locator("#entryDialog").evaluate(node => node.scrollWidth > node.clientWidth + 1);
          assert.equal(overflow, false);
          await page.screenshot({path:`/tmp/notice-center-${engine}-${width}.png`});
          await closeDialog(page);
          await refresh(page);
          assert.equal(await page.locator("#updateBanner").isVisible(), false);
        }, {width});
      }
      await run(browser, engine, "missing details do not mark a notice read", async page => {
        await page.evaluate(() => updateTest.detail("missing"));
        await page.locator(".release-empty").waitFor({timeout:3000});
        await closeDialog(page);
        assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-read-v2")), null);
      });
    } finally { await browser.close(); }
  }
  console.log(`${passed} update scenarios passed`);
} finally { await new Promise(resolve => server.close(resolve)); }
