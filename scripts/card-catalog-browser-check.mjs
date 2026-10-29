import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Isolated local records only; all external requests and cloud operations are blocked.
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
const app = await readFile(new URL("src/app.js", root), "utf8");
const cloud = await readFile(new URL("src/cloud.js", root), "utf8");
const version = JSON.parse(await readFile(new URL("releases.json", root), "utf8")).currentVersion;
const mocks = {
  isCloudConfigured: "() => false",
  getCloudConfig: '() => ({url:"",anonKey:""})',
  cloudSnapshot: '() => ({configured:false,signedIn:false})',
  initializeCloud: 'async () => ({configured:false,signedIn:false})'
};
const cloudMock = [...cloud.matchAll(/^export (?:async )?function (\w+)/gm)]
  .map(([,name]) => `export const ${name} = ${mocks[name] || "async () => []"};`).join("\n");
const hooks = `
window.catalogTest = {
  state: () => structuredClone(state),
  open: mode => openDialog(mode),
  match: () => { setRoute({name:"session",sessionId:"session"}); openDialog("match","match"); }
};`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = new URL(path === "/" ? "index.html" : `.${path}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    const body = path === "/src/app.js" ? app + hooks
      : path === "/src/cloud.js" ? cloudMock : await readFile(file);
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".json") ? "application/json" : "text/html";
    response.writeHead(200, {"Content-Type":type}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const cases = [
  {id:"dry-martini",name:"ドライマティーニ",colors:["black"]},
  {id:"conan-vs-kaito-kid",name:"コナンVS怪盗キッド",colors:["blue","white"]},
  {id:"who-are-you",name:"あんた何者や",colors:["green","red"]},
  {id:"mpd-public-security-undercover",name:"警視庁公安部の潜入捜査官",colors:["yellow","black"]}
];

async function selectCase(page, scope, color, card) {
  await page.locator(`label:has([data-partner-color-input="${scope}"][value="${color}"])`).click();
  await page.locator(`[data-open-case-card-picker="${scope}"]`).click();
  await page.locator("#caseCardSearch").fill(card.name);
  const option = page.locator(`[data-select-case-card="${card.id}"]`);
  assert.equal(await option.count(), 1, "No parallel-print duplicates");
  assert.equal(await option.locator("strong").textContent(), card.name);
  const geometry = await option.evaluate(node => ({
    width:node.clientWidth,scrollWidth:node.scrollWidth,right:node.getBoundingClientRect().right,
    viewport:innerWidth
  }));
  assert.ok(geometry.scrollWidth <= geometry.width + 1, "Card name fits");
  assert.ok(geometry.right <= geometry.viewport, "Picker stays within viewport");
  if (card.id === "mpd-public-security-undercover" && color === "yellow" && scope === "deck") {
    await page.screenshot({path:`/tmp/conan-catalog-${page.context().browser().browserType().name()}.png`});
  }
  await option.click();
  assert.equal(await page.locator(`[data-case-card-input="${scope}"]`).inputValue(), card.id);
}

async function save(page) {
  await page.locator("#dialogSubmit").click();
  await page.waitForFunction(() => !document.querySelector("#entryDialog").open);
}

async function close(page) {
  await page.locator('button[value="cancel"]').click();
  await page.waitForFunction(() => !document.querySelector("#entryDialog").open);
}

let passed = 0;
try {
  for (const [engine, type] of [["chromium",chromium],["webkit",webkit]]) {
    const browser = await type.launch({headless:true});
    try {
      for (const card of cases) for (const color of card.colors) {
        const context = await browser.newContext({viewport:{width:375,height:812},hasTouch:true,serviceWorkers:"block"});
        await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await context.addInitScript(version => {
          localStorage.setItem("conan-card-tracker-release-seen-v1", version);
          if (!localStorage.getItem("conan-card-tracker-v2:anonymous")) {
            localStorage.setItem("conan-card-tracker-v2:anonymous", JSON.stringify({
              decks:[{id:"deck",name:"既存デッキ",version:"v1",partnerColor:"green",caseCardId:"onimaru-unification"}],
              sessions:[{id:"session",deckId:"deck",name:"検証大会",date:"2026-10-29",recordType:"challenge",environment:"検証環境"}],
              matches:[{id:"match",sessionId:"session",opponentPlayer:"検証相手",result:"win",firstPlayer:"first"}],
              environments:["検証環境"]
            }));
          }
        }, version);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(origin);
          await page.waitForFunction(() => window.catalogTest);
          await page.evaluate(() => catalogTest.open("deck"));
          await page.locator('input[name="name"]').fill("新弾検証デッキ");
          await selectCase(page, "deck", color, card);
          await save(page);
          assert.equal(await page.evaluate(() => catalogTest.state().decks.at(-1).caseCardId), card.id);
          await page.evaluate(() => catalogTest.open("deckSettings"));
          assert.equal(await page.locator('[data-case-card-input="deck-settings"]').inputValue(), card.id);
          assert.equal(await page.locator('[data-case-card-selection="deck-settings"]').textContent(), card.name);
          await close(page);
          await page.evaluate(() => catalogTest.open("session"));
          await page.locator('input[name="name"]').fill("新弾検証大会");
          await save(page);
          assert.equal(await page.evaluate(() => catalogTest.state().sessions.at(-1).caseCardId), card.id);
          await page.evaluate(() => catalogTest.match());
          const details = page.locator(".match-extra-fields");
          if (!(await details.evaluate(node => node.open))) {
            await details.locator("summary").click();
          }
          await selectCase(page, "opponent", color, card);
          await save(page);
          await page.reload();
          await page.waitForFunction(() => window.catalogTest);
          await page.evaluate(() => catalogTest.match());
          assert.equal(await page.locator('[data-case-card-input="opponent"]').inputValue(), card.id);
          assert.equal(await page.locator('[data-case-card-selection="opponent"]').textContent(), card.name);
          assert.equal(await page.evaluate(() => catalogTest.state().decks[0].caseCardId), "onimaru-unification");
          assert.deepEqual(errors, []);
          passed++;
          console.log(`PASS ${engine}: ${card.name} (${color}) deck, session, opponent save/reopen`);
        } catch (error) {
          await page.screenshot({path:`/tmp/conan-catalog-${engine}-failure.png`});
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  console.log(`${passed} card catalog browser scenarios passed`);
} finally { await new Promise(resolve => server.close(resolve)); }
