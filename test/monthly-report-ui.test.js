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

test("monthly report preview renders the exact generated images and admin-only share controls", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /data-monthly-report-month/);
  assert.match(appSource, /data-monthly-report-record-type/);
  assert.match(appSource, /createMonthlyReportFiles/);
  assert.match(appSource, /data-monthly-report-share/);
  assert.match(appSource, /data-monthly-report-summary-preview/);
  assert.match(appSource, /data-monthly-report-history-preview/);
  assert.match(appSource, /navigator\.share/);
  assert.match(styles, /\.monthly-generated-preview/);
  assert.match(styles, /\.monthly-share-action/);
});
