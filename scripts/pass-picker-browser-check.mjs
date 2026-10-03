import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Optional integration check: the browser never connects to the live database.
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
const app = await readFile(new URL("src/app.js", root), "utf8");
const cloud = await readFile(new URL("src/cloud.js", root), "utf8");
const exports = [...cloud.matchAll(/^export (?:async )?function (\w+)/gm)].map(match => match[1]);
const mocks = {
  isCloudConfigured: "() => true",
  getCloudConfig: '() => ({url:"",anonKey:""})',
  cloudSnapshot: '() => ({configured:true,signedIn:false,userId:""})',
  initializeCloud: 'async () => ({configured:true,signedIn:!window.fixture.guest,userId:"preview",email:"preview@example.invalid"})',
  loadAccountContext: 'async () => ({schemaReady:true,termsAccepted:true,role:window.fixture.role,username:"Preview"})',
  loadCloudState: 'async () => ({data:structuredClone(window.fixture.data),updated_at:"2026-10-03T00:00:00Z"})',
  saveCloudState: 'async state => { window.saved = structuredClone(state); return "2026-10-03T01:00:00Z"; }'
};
const cloudMock = exports.map(name => `export const ${name} = ${mocks[name] || "async () => []"};`).join("\n");
const hooks = `
window.testApp = {
  ready: () => fixture.guest || accountContext.username === "Preview",
  open: (id = "match") => { setRoute({name:"session",sessionId:"session"}); openDialog("match",id); },
  state: () => structuredClone(state),
  view: () => setRoute({name:"session",sessionId:"session"}),
  preview: () => { adminPreview = {username:"Read only",viewedState:state,ownState:state}; render(); },
  passAccess: passPickerAccessible,
  announce: initializeReleaseNotes,
  banner: showUpdateBanner,
  share: () => buildSessionShareText({session:state.sessions[0],deck:state.decks[0],matches:state.matches})
};`;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  try {
    const file = new URL(path === "/" ? "index.html" : `.${path}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    const body = path === "/src/app.js" ? app + hooks
      : path === "/src/cloud.js" ? cloudMock
        : await readFile(file);
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".json") ? "application/json" : "text/html";
    response.writeHead(200, { "Content-Type": type }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const seed = {
  decks: [{id:"deck",name:"検証用デッキ",version:"v1",partnerColor:"green"}],
  sessions: [{id:"session",deckId:"deck",date:"2026-10-03",createdAt:"2026-10-03T00:00:00Z",name:"検証用大会",format:"BO1",environment:"テスト環境",recordType:"challenge"}],
  matches: [{id:"match",sessionId:"session",myDeck:"検証用デッキ",opponentDeck:"相手デッキ",opponentPlayer:"検証プレイヤー",result:"win",firstPlayer:"first",myPassed:"none",opponentPassed:"none",memo:""}],
  environments: ["テスト環境"]
};
let passed = 0;

async function run(browser, engine, name, options, check) {
  const context = await browser.newContext({viewport:{width:options.width || 390,height:844},hasTouch:true,serviceWorkers:"block",timezoneId:"Asia/Tokyo"});
  await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const data = structuredClone(seed);
  Object.assign(data.matches[0], options.match || {});
  await context.addInitScript(fixture => {
    window.fixture = fixture;
    if (!localStorage.getItem("conan-card-tracker-release-seen-v1")) {
      localStorage.setItem("conan-card-tracker-release-seen-v1", fixture.seenVersion);
    }
    localStorage.setItem(`conan-card-tracker-v2:${fixture.guest ? "anonymous" : "user:preview"}`, JSON.stringify(fixture.data));
  }, {role:options.role ?? "superadmin",guest:Boolean(options.guest),seenVersion:options.seenVersion ?? "57",data});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.testApp?.ready() && testApp.state().matches.length === 1);
    await check(page);
    assert.deepEqual(errors, [], "No uncaught browser errors");
    passed++;
    console.log(`PASS ${engine}: ${name}`);
  } catch (error) {
    console.error({ name, errors, diagnostics: await page.evaluate(() => ({
      loaded: Boolean(window.testApp), ready: window.testApp?.ready(),
      matchCount: window.testApp?.state().matches.length,
      status: document.querySelector("#syncStatus")?.textContent,
      message: document.querySelector(".cloud-message")?.textContent
    })) });
    await page.screenshot({path:`/tmp/conan-pass-${engine}-failure.png`});
    throw error;
  } finally { await context.close(); }
}

async function open(page) {
  await page.evaluate(() => testApp.open());
  await page.locator("[data-pass-picker]").first().scrollIntoViewIfNeeded();
}

async function save(page) {
  await page.locator("#dialogSubmit").click();
  await page.waitForFunction(() => !document.querySelector("#entryDialog").open);
}

try {
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await type.launch({headless:true});
    try {
      for (const width of [320,375,390,430,1024]) {
        await run(browser, engine, `admin save/reopen and layout at ${width}px`, {width}, async page => {
          await open(page);
          assert.equal(await page.locator("[data-pass-number]").count(), 6);
          const self = page.locator("[data-pass-picker]").nth(0);
          const opponent = page.locator("[data-pass-picker]").nth(1);
          await self.locator('[value="2"][type="checkbox"]').check();
          await self.locator('[value="3"][type="checkbox"]').check();
          for (const number of [1,2,3]) await opponent.locator(`[value="${number}"][type="checkbox"]`).check();
          assert.equal(await page.locator('input[name="myPassed"]').inputValue(), "pass23");
          assert.equal(await page.locator('input[name="opponentPassed"]').inputValue(), "pass123");
          const layout = await page.locator("[data-pass-picker]").evaluateAll(fields => fields.map(field => {
            const rect = field.getBoundingClientRect();
            const items = [...field.querySelectorAll(".pass-number-option")].map(item => { const r = item.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; });
            return {x:rect.x,y:rect.y,right:rect.right,width:rect.width,scrollWidth:field.scrollWidth,items};
          }));
          assert.ok(Math.abs(layout[0].y - layout[1].y) < 1, "Groups share a row");
          for (const field of layout) {
            assert.ok(field.scrollWidth <= field.width + 1, "No horizontal overflow");
            assert.ok(field.right <= width);
            assert.ok(field.items.every(item => item.height >= 44 && item.width >= 32), "Usable touch targets");
            assert.ok(field.items.every(item => Math.abs(item.y - field.items[0].y) < 1));
          }
          if (width === 390) await page.screenshot({path:`/tmp/conan-pass-${engine}-input.png`});
          await save(page);
          assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), "pass23");
          assert.ok((await page.evaluate(() => testApp.share())).includes("｜2&3パス・被1&2&3パス"));
          await open(page);
          assert.deepEqual(await self.locator("input:checked").evaluateAll(inputs => inputs.map(input => input.value)), ["2","3"]);
          assert.deepEqual(await opponent.locator("input:checked").evaluateAll(inputs => inputs.map(input => input.value)), ["1","2","3"]);
          await save(page);
          const card = page.locator(".session-round-history-card").first();
          const status = card.locator(".match-history-status");
          const geometry = await status.evaluate(node => {
            const r = node.getBoundingClientRect();
            const parent = node.closest(".match-history-card").getBoundingClientRect();
            return {right:r.right,parentRight:parent.right,top:r.top,bottom:r.bottom,tops:[...node.children].map(c => c.getBoundingClientRect().top)};
          });
          assert.ok(geometry.right <= geometry.parentRight + 1, "Badges stay inside card");
          assert.ok(geometry.tops.every(top => Math.abs(top - geometry.tops[0]) < 1), "Badges do not wrap");
          assert.ok(await card.locator(".match-history-secondary").isVisible());
          if (width === 390) await page.screenshot({path:`/tmp/conan-pass-${engine}-history.png`});
        });
      }
      await run(browser, engine, "new match starts with no passes and persists selected numbers", {}, async page => {
        await page.evaluate(() => testApp.open(null));
        await page.locator(".match-extra-fields summary").click();
        assert.equal(await page.locator("[data-pass-number]:checked").count(), 0);
        await page.locator('select[name="result"]').selectOption("win");
        await page.locator('select[name="firstPlayer"]').selectOption("second");
        const self = page.locator("[data-pass-picker]").first();
        await self.locator('[value="2"][type="checkbox"]').check();
        await self.locator('[value="3"][type="checkbox"]').check();
        await save(page);
        await page.waitForFunction(() => window.saved?.matches.length === 2);
        const saved = await page.evaluate(() => ({
          local: JSON.parse(localStorage.getItem("conan-card-tracker-v2:user:preview")),
          cloud: window.saved
        }));
        for (const data of [saved.local, saved.cloud]) {
          assert.equal(data.matches.find(match => match.id !== "match").myPassed, "pass23");
          assert.equal(data.matches.find(match => match.id !== "match").opponentPassed, "none");
        }
      });
      await run(browser, engine, "all combinations, keyboard selection and clear", {}, async page => {
        for (const numbers of [[],[1],[2],[3],[1,2],[1,3],[2,3],[1,2,3]]) {
          await open(page);
          const self = page.locator("[data-pass-picker]").first();
          for (const number of [1,2,3]) await self.locator(`[value="${number}"][type="checkbox"]`).setChecked(numbers.includes(number));
          await save(page);
          assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), numbers.length ? `pass${numbers.join("")}` : "none");
        }
        await open(page);
        const first = page.locator('[data-pass-number][value="1"]').first();
        await first.focus();
        await first.press("Space");
        assert.equal(await page.locator('input[name="myPassed"]').inputValue(), "pass23");
      });
      await run(browser, engine, "legacy pass presence survives unrelated editing", {match:{myPassed:true,opponentPassed:false}}, async page => {
        await open(page);
        assert.equal(await page.locator("[data-pass-number]:checked").count(), 0);
        assert.equal(await page.locator("[data-pass-legacy]").count(), 1);
        await page.locator('textarea[name="memo"]').fill("内容を変更");
        await save(page);
        assert.equal(await page.evaluate(() => String(testApp.state().matches[0].myPassed)), "true");
        await open(page);
        await page.locator('[data-pass-number][value="2"]').first().check();
        assert.equal(await page.locator("[data-pass-legacy]").count(), 0);
        await save(page);
        assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), "pass2");
      });
      for (const [name, options] of [["regular account",{role:""}],["guest",{role:"",guest:true}]]) {
        await run(browser, engine, `${name} can save and reopen multiple passes`, options, async page => {
          await open(page);
          assert.equal(await page.locator("[data-pass-number]").count(), 6);
          assert.equal(await page.locator('select[name="myPassed"]').count(), 0);
          const self = page.locator("[data-pass-picker]").first();
          const opponent = page.locator("[data-pass-picker]").nth(1);
          for (const number of [2,3]) await self.locator(`[value="${number}"][type="checkbox"]`).check();
          for (const number of [1,3]) await opponent.locator(`[value="${number}"][type="checkbox"]`).check();
          await save(page);
          await open(page);
          assert.equal(await page.locator('input[name="myPassed"]').inputValue(), "pass23");
          assert.equal(await page.locator('input[name="opponentPassed"]').inputValue(), "pass13");
          assert.ok((await page.evaluate(() => testApp.share())).includes("｜2&3パス・被1&3パス"));
        });
      }
      await run(browser, engine, "regular account preserves imported preview combination", {role:"",match:{myPassed:"pass23"}}, async page => {
        await open(page);
        assert.equal(await page.locator('input[name="myPassed"]').inputValue(), "pass23");
        await save(page);
        assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), "pass23");
      });
      await run(browser, engine, "pending retains passes and bye clears them", {match:{result:"pending",firstPlayer:"first",myPassed:"pass23",opponentPassed:"pass13"}}, async page => {
        await open(page);
        await save(page);
        assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), "pass23");
        await open(page);
        await page.locator('select[name="result"]').selectOption("bye");
        assert.equal(await page.locator("[data-pass-picker]").first().isVisible(), false);
        await save(page);
        assert.equal(await page.evaluate(() => testApp.state().matches[0].myPassed), "none");
        assert.equal(await page.evaluate(() => testApp.state().matches[0].opponentPassed), "none");
      });
      await run(browser, engine, "viewing another account is not a preview editing permission", {}, async page => {
        await page.evaluate(() => testApp.preview());
        assert.equal(await page.evaluate(() => testApp.passAccess()), false);
        assert.equal(await page.locator("[data-edit-match]").count(), 0);
      });
      await run(browser, engine, "regular users see the public release once and can reopen its details", {role:"",seenVersion:"56"}, async page => {
        await page.waitForFunction(() => document.querySelector("#dialogTitle").textContent === "パスを番号で複数選択できるようになりました");
        assert.equal(await page.locator("#entryDialog").isVisible(), true);
        assert.ok((await page.locator(".release-details").innerText()).includes("2&3パス"));
        assert.ok((await page.locator(".release-details").innerText()).includes("X投稿"));
        assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-release-seen-v1")), "57");
        await page.screenshot({path:`/tmp/conan-pass-${engine}-release.png`});
        await page.locator('button[value="cancel"]').click();
        assert.equal(await page.evaluate(() => testApp.announce()), false);
        assert.equal(await page.locator("#entryDialog").isVisible(), false);
        await page.evaluate(() => testApp.banner());
        await page.waitForFunction(() => document.querySelector("#updateBannerTitle").textContent === "パスを番号で複数選択できるようになりました");
        assert.equal(await page.locator("#updateBanner").isVisible(), true);
        await page.locator("#showUpdateDetailsButton").click();
        assert.equal(await page.locator("#entryDialog").isVisible(), true);
        await page.locator('button[value="cancel"]').click();
        await page.locator("#applyUpdateButton").click();
        await page.waitForLoadState("load");
        await page.waitForFunction(() => window.testApp?.ready());
        assert.equal(await page.evaluate(() => testApp.announce()), false);
        await open(page);
        assert.equal(await page.locator("[data-pass-number]").count(), 6);
      });
    } finally { await browser.close(); }
  }
  console.log(`${passed} browser scenarios passed`);
} finally { await new Promise(resolve => server.close(resolve)); }
