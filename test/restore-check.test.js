import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const moduleUrl = new URL("../scripts/restore-check.mjs", import.meta.url);
const root = new URL("../", import.meta.url);

test("restore check parses quoted COPY blocks without interpreting record contents", async () => {
  const { parseCopyTables } = await import(moduleUrl);
  const tables = parseCopyTables('-- dump\nCOPY "public"."app_states" ("user_id", "data") FROM stdin;\nuser1\t{"note":"escaped\\nline"}\nuser2\t\\N\n\\.\nRESET ALL;\n');
  assert.equal(tables.length, 1);
  assert.equal(tables[0].table, '"public"."app_states"');
  assert.equal(tables[0].columns, '"user_id", "data"');
  assert.equal(tables[0].rows.length, 2);
  assert.match(tables[0].rows[0], /escaped\\nline/);
});

test("restore check fails closed on unsupported or incomplete COPY blocks", async () => {
  const { parseCopyTables } = await import(moduleUrl);
  for (const dump of [
    'COPY "public"."app_states" ("data") FROM stdin;\nsecret-record\n',
    'COPY "public"."app_states" ("data"); DROP TABLE x; -- FROM stdin;\n',
    'COPY "public"."app_states" ("data") FROM stdin;\n\\.\nCOPY "public"."app_states" ("data") FROM stdin;\n\\.\n',
  ]) assert.throws(() => parseCopyTables(dump), error => !error.message.includes("secret-record"));
});

test("full-record verification ignores row order but detects altered and duplicate rows", async () => {
  const { sameRows } = await import(moduleUrl);
  assert.equal(sameRows(["a\t1", "b\t2"], ["b\t2", "a\t1"]), true);
  assert.equal(sameRows(["a\t1", "b\t2"], ["a\t1", "b\t3"]), false);
  assert.equal(sameRows(["a", "b"], ["a", "a"]), false);
  assert.equal(sameRows([], []), true);
});

test("restore commands can only target the fixed isolated local container", async () => {
  const { localPsqlArgs } = await import(moduleUrl);
  assert.deepEqual(localPsqlArgs().slice(0, 4), ["exec", "-i", "supabase_db_restore-check", "psql"]);
  assert.throws(() => localPsqlArgs("production"));
  assert.throws(() => localPsqlArgs("postgresql://example.invalid"));
  assert.ok(!localPsqlArgs().join(" ").includes("--host"));
});

test("restore config matches the dump PostgreSQL major version", async () => {
  const { configureDatabase } = await import(moduleUrl);
  const config = 'project_id = "restore-check"\n[db]\nmajor_version = 17\n';
  assert.match(configureDatabase(config, "-- Dumped from database version 15.8\n"), /major_version = 15/);
  assert.throws(() => configureDatabase(config, "unrecognized header"));
  assert.throws(() => configureDatabase('project_id = "production"', "-- Dumped from database version 17.6\n"));
});

test("restore workflow only uses saved backups, never production DB credentials", async () => {
  const workflowText = await readFile(new URL(".github/workflows/supabase-restore-check.yml", root), "utf8");
  const workflow = parse(workflowText);
  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.permissions.actions, "read");
  assert.doesNotMatch(workflowText, /SUPABASE_DB_URL|RESTORE_DB_URL|supabase db (push|reset)|supabase link/);
  assert.match(workflowText, /docker network disconnect/);
  assert.match(workflowText, /supabase db start/);
  assert.match(workflowText, /name: Remove temporary data\s+if: always\(\)/);
  assert.doesNotMatch(workflowText, /upload-artifact/);
  const steps = workflow.jobs.restore.steps;
  assert.ok(steps.findIndex(step => step.name === "Isolate local database") < steps.findIndex(step => step.name === "Restore and verify backup"));
});
