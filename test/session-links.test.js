import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSessionRelatedUrl,
  sessionRelatedUrlValidationMessage
} from "../src/session-links.js";

test("blank session links stay optional", () => {
  assert.equal(normalizeSessionRelatedUrl(""), "");
  assert.equal(normalizeSessionRelatedUrl("   "), "");
  assert.equal(sessionRelatedUrlValidationMessage(""), "");
});

test("HTTP and HTTPS session links are trimmed and normalized", () => {
  assert.equal(
    normalizeSessionRelatedUrl("  https://example.com/tournaments/123  "),
    "https://example.com/tournaments/123"
  );
  assert.equal(
    normalizeSessionRelatedUrl("http://example.com/bracket?q=1"),
    "http://example.com/bracket?q=1"
  );
  assert.equal(sessionRelatedUrlValidationMessage("https://example.com"), "");
});

test("unsupported, relative, and malformed session links are rejected", () => {
  const message = "http:// または https:// で始まるURLを入力してください";

  assert.equal(normalizeSessionRelatedUrl("javascript:alert(1)"), "");
  assert.equal(normalizeSessionRelatedUrl("ftp://example.com/file"), "");
  assert.equal(normalizeSessionRelatedUrl("/tournaments/123"), "");
  assert.equal(normalizeSessionRelatedUrl("https://"), "");
  assert.equal(sessionRelatedUrlValidationMessage("javascript:alert(1)"), message);
  assert.equal(sessionRelatedUrlValidationMessage("example.com"), message);
});
