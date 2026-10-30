import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
const app = await readFile(new URL("src/app.js", root), "utf8");
const cloud = await readFile(new URL("src/cloud.js", root), "utf8");
const mocks = {
  isCloudConfigured: "() => true",
  getCloudConfig: '() => ({url:"https://example.invalid",anonKey:"synthetic"})',
  cloudSnapshot: '() => ({configured:true,signedIn:window.authFixture.signedIn,userId:window.authFixture.signedIn ? "test-user" : "",email:"test@example.invalid"})',
  initializeCloud: "async () => cloudSnapshot()",
  loadEnvironmentCatalog: 'async () => { if(window.authFixture.deferEnvironment) { window.authFixture.environmentWaiting = true; await new Promise(resolve => { window.authFixture.finishEnvironment = resolve; }); } return []; }',
  loadAccountContext: 'async () => ({schemaReady:true,termsAccepted:true,username:"検証ユーザー"})',
  signInWithEmail: `async (...args) => { window.authFixture.emails.push(args); if(window.authFixture.mailError) throw new Error(window.authFixture.mailError); }`,
  verifyEmailOtp: `async (email,code) => { window.authFixture.otp = {email,code}; window.authFixture.signedIn=true; return cloudSnapshot(); }`,
  loadCloudState: `async () => { window.authFixture.reads++; if(window.authFixture.readError) throw new Error("offline"); return window.authFixture.remote; }`,
  saveCloudState: `async (data,options) => { window.authFixture.writes.push({data,options}); return "2026-10-30T01:00:00Z"; }`,
  signOutCloud: `async () => { window.authFixture.logouts++; window.authFixture.signedIn=false; return cloudSnapshot(); }`,
};
const cloudMock = [...cloud.matchAll(/^export (?:async )?function (\w+)/gm)]
  .map(([, name]) => `export const ${name} = ${mocks[name] || "async () => []"};`).join("\n");
const hooks = `
window.accountTest = {
  open: () => openDialog("cloudSettings"),
  account: (flags={}) => {
    window.clearTimeout(cloudSaveTimer);
    window.authFixture.signedIn=true;
    cloudStatus=cloudSnapshot(); activateUserLocalState("test-user");
    localDirty=Boolean(flags.dirty); cloudConflict=Boolean(flags.conflict);
    cloudSaveInFlight=Boolean(flags.busy); cloudUpdatedAt=flags.updatedAt || null;
    pendingRemoteState=null; cloudMessage="";
    openDialog("cloudSettings");
  },
  dirty: () => { localDirty=true; },
  refresh: refreshCloudSession,
  state: () => structuredClone(state),
};`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = new URL(path === "/" ? "index.html" : `.${path}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    const body = path === "/src/app.js" ? app + hooks : path === "/src/cloud.js" ? cloudMock : await readFile(file);
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".json") ? "application/json" : "text/html";
    response.writeHead(200, { "Content-Type": type }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function logoutEntry(page) {
  await page.locator(".account-actions summary").click();
  await page.locator("[data-cloud-logout]").click();
}

let passed = 0;
try {
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await type.launch({ headless: true });
    try {
      for (const width of [320, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, serviceWorkers: "block" });
        await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await context.addInitScript(() => {
          window.authFixture = { signedIn: false, emails: [], writes: [], reads: 0, logouts: 0, remote: null };
          localStorage.setItem("conan-card-tracker-release-seen-v1", "60");
          if (!localStorage.getItem("conan-card-tracker-v2:user:test-user")) {
            localStorage.setItem("conan-card-tracker-v2:user:test-user", JSON.stringify({decks:[{id:"kept",name:"保存する記録"}],sessions:[],matches:[],environments:[]}));
          }
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(origin);
          await page.waitForFunction(() => window.accountTest);
          await page.evaluate(() => accountTest.open());
          assert.equal(await page.locator("[data-cloud-existing-login]").isVisible(), true, "Existing login is visible by default");
          assert.equal(await page.locator("[data-cloud-login]").count(), 0);
          await page.locator('[data-auth-mode="signup"]').click();
          await page.locator('[name="cloudUsername"]').fill("登録テスト");
          await page.locator('[name="cloudEmail"]').fill("signup@example.invalid");
          await page.locator('[name="termsAccepted"]').check();
          await page.evaluate(() => { authFixture.mailError = "SMTP connection failed"; });
          await page.locator("[data-cloud-login]").click();
          await page.waitForFunction(() => document.querySelector(".cloud-message")?.textContent.includes("管理者"));
          assert.equal(await page.locator('[name="cloudEmail"]').inputValue(), "signup@example.invalid");
          assert.equal(await page.locator('[name="cloudUsername"]').inputValue(), "登録テスト");
          assert.equal(await page.locator('[name="termsAccepted"]').isChecked(), true);
          await page.evaluate(() => { authFixture.mailError = ""; });
          await page.locator("[data-cloud-login]").click();
          await page.locator('[name="cloudOtp"]').waitFor();
          assert.equal(await page.evaluate(() => authFixture.emails.at(-1)[1].username), "登録テスト");
          await page.locator("[data-reset-registration]").click();
          assert.equal(await page.locator('[name="cloudEmail"]').inputValue(), "signup@example.invalid");
          await page.locator('[data-auth-mode="login"]').click();
          passed += 2;
          await page.locator('[name="existingCloudEmail"]').fill("test@example.invalid");
          await page.evaluate(() => { authFixture.mailError = "SMTP connection failed"; });
          await page.locator("[data-cloud-existing-login]").click();
          await page.waitForFunction(() => document.querySelector(".cloud-message")?.textContent.includes("管理者"));
          assert.equal(await page.locator('[name="existingCloudEmail"]').inputValue(), "test@example.invalid");
          await page.screenshot({ path: `/tmp/conan-account-login-${engine}-${width}.png` });
          await page.evaluate(() => { authFixture.mailError = ""; });
          await page.locator("[data-cloud-existing-login]").click();
          await page.locator('[name="cloudOtp"]').fill("12345678");
          await page.locator("[data-verify-auth-code]").click();
          await page.waitForFunction(() => document.querySelector("#dialogTitle").textContent === "クラウド同期");
          assert.equal(await page.evaluate(() => authFixture.emails.at(-1)[2]), false, "Login never creates an account");
          assert.equal(await page.evaluate(() => authFixture.otp.code), "12345678");
          assert.match(await page.locator(".sync-guidance").textContent(), /最終同期/);
          // Keep independent anonymous/account records through cancelled and confirmed logout.
          await page.evaluate(() => {
            localStorage.setItem("account-before", localStorage.getItem("conan-card-tracker-v2:user:test-user"));
            localStorage.setItem("conan-card-tracker-v2:anonymous", JSON.stringify({decks:[{id:"anon",name:"匿名の記録"}],sessions:[],matches:[],environments:[]}));
          });
          await logoutEntry(page);
          assert.equal(await page.evaluate(() => authFixture.logouts), 0);
          await page.locator('[data-open-menu-panel="cloudSettings"]').click();
          await logoutEntry(page);
          await page.locator("[data-confirm-logout]").click();
          await page.waitForFunction(() => authFixture.logouts === 1);
          assert.equal(await page.evaluate(() => localStorage.getItem("conan-card-tracker-v2:user:test-user")), await page.evaluate(() => localStorage.getItem("account-before")));
          assert.match(await page.evaluate(() => localStorage.getItem("conan-card-tracker-v2:anonymous")), /匿名の記録/);
          assert.equal(await page.locator("[data-cloud-existing-login]").isVisible(), true);
          await page.locator('[data-auth-mode="signup"]').click();
          assert.equal(await page.locator('[name="cloudUsername"]').inputValue(), "", "Completed account name is not reused for a new signup");
          assert.equal(await page.locator('[name="termsAccepted"]').isChecked(), false, "Another signup requires fresh consent");
          await page.locator('[data-auth-mode="login"]').click();
          passed++;
          passed += 4;

          for (const flags of [{ dirty: true }, { conflict: true }, { busy: true }]) {
            await page.evaluate(flags => accountTest.account(flags), flags);
            await logoutEntry(page);
            assert.equal(await page.locator("[data-confirm-logout]").count(), 0);
            assert.equal(await page.evaluate(() => authFixture.logouts), 1);
            passed++;
          }
          await page.evaluate(() => accountTest.account());
          await logoutEntry(page);
          await page.evaluate(() => accountTest.dirty());
          await page.locator("[data-confirm-logout]").click();
          assert.equal(await page.evaluate(() => authFixture.logouts), 1, "Guard is rechecked at confirmation");
          passed++;

          await page.evaluate(() => accountTest.account({ dirty: true, updatedAt: "2026-10-29T00:00:00Z" }));
          await page.locator("[data-sync-retry]").click();
          await page.waitForFunction(() => document.querySelector(".sync-guidance")?.textContent.includes("同期済み"));
          assert.equal(await page.evaluate(() => authFixture.writes.at(-1).options.expectedUpdatedAt), "2026-10-29T00:00:00Z");
          assert.equal(await page.evaluate(() => Boolean(authFixture.writes.at(-1).options.force)), false);
          await page.evaluate(() => accountTest.account({ dirty: true, updatedAt: "2026-10-29T00:00:00Z" }));
          const beforeOffline = await page.evaluate(() => ({reads:authFixture.reads,writes:authFixture.writes.length}));
          await context.setOffline(true);
          await page.locator("[data-sync-retry]").click();
          assert.match(await page.locator(".cloud-message").textContent(), /オフライン/);
          assert.deepEqual(await page.evaluate(() => ({reads:authFixture.reads,writes:authFixture.writes.length})), beforeOffline);
          await context.setOffline(false);
          await page.waitForFunction(() => document.querySelector(".sync-guidance")?.textContent.includes("同期済み"));
          passed++;
          const writes = await page.evaluate(() => authFixture.writes.length);
          await page.evaluate(() => {
            accountTest.account({ conflict: true, dirty: true });
            authFixture.remote = { data: {decks:[{id:"remote",name:"別端末の記録"}],sessions:[],matches:[],environments:[]}, updated_at:"2026-10-30T02:00:00Z" };
          });
          await page.locator("[data-sync-retry]").click();
          await page.waitForFunction(() => document.querySelector(".sync-compare"));
          assert.equal(await page.evaluate(() => authFixture.writes.length), writes, "Conflict retry only compares, never force-saves");
          assert.equal(await page.evaluate(() => accountTest.state().decks.some(deck => deck.id === "remote")), false);
          await page.screenshot({ path: `/tmp/conan-account-sync-${engine}-${width}.png` });
          passed += 2;
          const geometry = await page.locator("#entryDialog").evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, right: node.getBoundingClientRect().right, viewport: innerWidth }));
          assert.ok(geometry.scroll <= geometry.width + 1 && geometry.right <= geometry.viewport);
          assert.deepEqual(errors, []);
          await page.goto(`${origin}/?start=account`);
          await page.locator("[data-cloud-login]").waitFor();
          assert.equal(await page.locator('[data-auth-mode="signup"]').getAttribute("aria-pressed"), "true");
          passed++;
          await page.evaluate(() => {
            authFixture.signedIn = true;
            authFixture.deferEnvironment = true;
            void accountTest.refresh();
          });
          await page.waitForFunction(() => authFixture.environmentWaiting);
          await page.evaluate(() => accountTest.open());
          assert.equal(await page.locator("[data-sync-retry]").isDisabled(), true, "No sync before account storage activates");
          await logoutEntry(page);
          assert.equal(await page.locator("[data-confirm-logout]").count(), 0);
          assert.equal(await page.evaluate(() => authFixture.writes.length), 0, "Initialization gap cannot upload guest records");
          await page.evaluate(() => { authFixture.deferEnvironment = false; authFixture.finishEnvironment(); });
          await page.waitForFunction(() => authFixture.writes.length > 0);
          assert.equal(await page.evaluate(() => authFixture.writes[0].data.decks.some(deck => deck.id === "anon")), false);
          passed++;
          console.log(`PASS ${engine} ${width}px: login, OTP, mail failure, guarded logout, safe sync retry`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  console.log(`${passed} account browser scenarios passed`);
} finally { await new Promise(resolve => server.close(resolve)); }
