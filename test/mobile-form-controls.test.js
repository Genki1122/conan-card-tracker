import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("mobile form controls use a readable size without disabling page zoom", async () => {
  const [indexHtml, styles] = await Promise.all([
    readFile(new URL("index.html", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8")
  ]);

  assert.match(styles, /body input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*body select,\s*body textarea\s*\{\s*font-size: 16px;/);
  assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
});

test("saving a dialog releases focused controls before closing it", async () => {
  const appSource = await readFile(new URL("src/app.js", rootUrl), "utf8");

  assert.match(appSource, /releaseDialogFocus\(\);\s*dialog\.close\(\);\s*entryForm\.reset\(\);/);
});
