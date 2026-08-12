import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("cross aggregation rows open a restorable matchup detail route", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /data-open-matchup/);
  assert.match(appSource, /name: "matchupDetail"/);
  assert.match(appSource, /returnRoute = \{ \.\.\.route, restoreScrollY: window\.scrollY \}/);
  assert.match(appSource, /route\.name === "matchupDetail"\) setRoute\(route\.returnRoute/);
  assert.match(appSource, /if \(route\.name === "matchupDetail"\) renderMatchupDetail\(\)/);
});

test("matchup result and turn filters restore focus after rerender", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /data-matchup-result/);
  assert.match(appSource, /data-matchup-turn/);
  assert.match(appSource, /restoreFocus/);
  assert.match(appSource, /focus\(\{ preventScroll: true \}\)/);
});

test("history cards share compact pass and result layout across user and admin views", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("src/app.js", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(appSource, /const tag = adminPreview \? "article" : "button"/);
  assert.match(appSource, /className: "session-round-history-card"/);
  assert.match(appSource, /className: "player-match-history-card"/);
  assert.match(appSource, /className: "matchup-history-card"/);
  assert.match(styles, /\.match-history-topline\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s);
  assert.match(styles, /\.match-history-status\s*\{[^}]*white-space: nowrap/s);
  assert.match(styles, /\.pass-badge\.self/);
  assert.match(styles, /\.pass-badge\.opponent/);
});

test("summary and drilldown resolve the same effective analysis filters", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");
  const uses = appSource.match(/resolveAnalysisContext\(\)/g) || [];

  assert.ok(uses.length >= 2);
  assert.match(appSource, /selectedVersion = sourceRoute\.version && versions\.includes/);
  assert.match(appSource, /selectedEnvironment = sourceRoute\.environment && environments\.includes/);
  assert.match(appSource, /selectedStore = sourceRoute\.store && stores\.includes/);
});
