import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("admin users default to latest sync and distinguish registered from filtered users", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /adminMetric\("対象利用者", dashboard\.summary\.users\)/);
  assert.match(appSource, /<h2>登録利用者 <span>\$\{dashboard\.userRows\.length\}人<\/span><\/h2>/);
  assert.match(appSource, /adminUserSort\) \? route\.adminUserSort : "latest"/);
});

test("admin account management separates preview and deletion and keeps impact visible", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /data-open-admin-user/);
  assert.match(appSource, /data-manage-admin-user/);
  assert.match(appSource, /残す同名アカウント/);
  assert.match(appSource, /data-delete-empty-admin-account disabled/);
  assert.match(styles, /\.admin-account-counts[^}]*grid-template-columns: repeat\(3, 1fr\)/s);
  assert.match(styles, /\.admin-user-manage/);
});

test("admin account deletion explains a missing recovery-status setup", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /error\?\.code === "42P01"/);
  assert.match(appSource, /message\.includes\("account_recovery_status"\)/);
  assert.match(appSource, /引き継ぎ管理設定が不足しています/);
});
