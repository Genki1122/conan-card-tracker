import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("monthly report preview is reachable only from the superadmin analysis view", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /accountContext\.role === "superadmin" && !adminPreview/);
  assert.match(appSource, /data-open-monthly-report/);
  assert.match(appSource, /function renderMonthlyReport/);
  assert.match(appSource, /accountContext\.role !== "superadmin"/);
  assert.match(appSource, /if \(route\.name === "monthlyReport"\) renderMonthlyReport\(\)/);
});

test("monthly report preview renders separate summary and event-history share sheets", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /data-monthly-report-month/);
  assert.match(appSource, /data-monthly-report-record-type/);
  assert.match(appSource, /monthly-share-sheet summary-sheet/);
  assert.match(appSource, /monthly-share-sheet history-sheet/);
  assert.match(appSource, /共有機能はレビュー後に有効化/);
  assert.match(styles, /\.monthly-share-sheet/);
  assert.match(styles, /\.monthly-event-row/);
});
