import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sessions normalize, collect, and save one optional related URL", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /relatedUrl:\s*normalizeSessionRelatedUrl\(session\.relatedUrl\)/);
  assert.match(appSource, /name="relatedUrl"/);
  assert.match(appSource, /関連URL（任意）/);
  assert.match(appSource, /sessionRelatedUrlValidationMessage/);
  assert.match(appSource, /relatedUrl:\s*normalizeSessionRelatedUrl\(data\.get\("relatedUrl"\)\)/);
});

test("session detail exposes a safe link without adding it to deck session cards", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const deckDetailSource = appSource.slice(
    appSource.indexOf("function renderDeckDetail"),
    appSource.indexOf("function renderSession")
  );

  assert.match(appSource, /class="session-related-link"/);
  assert.match(appSource, /target="_blank"/);
  assert.match(appSource, /rel="noopener noreferrer"/);
  assert.match(appSource, /関連リンク ↗/);
  assert.doesNotMatch(deckDetailSource, /relatedUrl|関連リンク/);
});
