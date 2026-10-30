import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const workflow = async name => parse(await readFile(new URL(`.github/workflows/${name}.yml`, root), "utf8"));

test("Pages can deploy only after the reusable verification job succeeds", async () => {
  const pages = await workflow("pages");
  assert.equal(pages.jobs.verify?.uses, "./.github/workflows/checks.yml");
  assert.equal(pages.jobs.deploy.needs, "verify");
  assert.equal(pages.jobs.verify["continue-on-error"], undefined);
  assert.equal(pages.jobs.deploy.if, undefined);
});

test("PRs and deployment use locked unit and Chromium/WebKit browser checks without production secrets", async () => {
  const checks = await workflow("checks");
  assert.ok(Object.hasOwn(checks.on, "workflow_call"));
  assert.ok(Object.hasOwn(checks.on, "pull_request"));
  const job = checks.jobs.test;
  assert.equal(job.steps.find(step => step.uses?.startsWith("actions/checkout@"))?.with?.["fetch-depth"], 0);
  const commands = job.steps.map(step => step.run || "").join("\n");
  assert.match(commands, /npm ci/);
  assert.match(commands, /npm test/);
  assert.match(commands, /playwright install --with-deps chromium webkit/);
  assert.match(commands, /npm run test:browser/);
  assert.doesNotMatch(JSON.stringify(checks), /secrets\.|continue-on-error/);
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.scripts["test:browser"], "node scripts/browser-checks.mjs");
  assert.match(pkg.devDependencies.playwright, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
  assert.equal(lock.packages["node_modules/playwright"].version, pkg.devDependencies.playwright);
});
