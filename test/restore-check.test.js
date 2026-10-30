import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
  assert.ok(localPsqlArgs("supabase_db_restore-check", "supabase_admin").includes("supabase_admin"));
  assert.throws(() => localPsqlArgs("supabase_db_restore-check", "unapproved-role"));
});

test("restore removes inherited table grants for both local creator roles before applying saved schema", async () => {
  const source = await readFile(moduleUrl, "utf8");
  assert.match(source, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres, supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated/);
  assert.ok(source.indexOf("ALTER DEFAULT PRIVILEGES") < source.indexOf("${schema}"));
  assert.doesNotMatch(source, /REVOKE ALL ON (?:TABLE )?(?:public\.)?app_state_versions/i);
});

test("restore config matches the dump PostgreSQL major version", async () => {
  const { configureDatabase } = await import(moduleUrl);
  const config = 'project_id = "restore-check"\n[db]\nmajor_version = 17\n';
  assert.match(configureDatabase(config, "-- Dumped from database version 15.8\n"), /major_version = 15/);
  assert.match(configureDatabase(config, "-- schema without header", "-- Dumped from database version 17.6\n"), /major_version = 17/);
  assert.throws(() => configureDatabase(config, "unrecognized header"));
  assert.throws(() => configureDatabase('project_id = "production"', "-- Dumped from database version 17.6\n"));
});

test("restore workflow only uses saved backups, never production DB credentials", async () => {
  const workflowText = await readFile(new URL(".github/workflows/supabase-restore-check.yml", root), "utf8");
  const workflow = parse(workflowText);
  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.on.workflow_dispatch.inputs.rehearse_history.default, false);
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

test("production history setup is manual and requires a recent encrypted backup", async () => {
  const text = await readFile(new URL(".github/workflows/supabase-history-setup.yml", root), "utf8");
  const workflow = parse(text);
  assert.ok(workflow.on.workflow_dispatch.inputs.backup_run_id.required);
  assert.ok(workflow.on.workflow_dispatch.inputs.rehearsal_run_id.required);
  assert.equal(workflow.on.schedule, undefined);
  assert.match(text, /Backup is not recent/);
  assert.match(text, /--single-transaction/);
  assert.match(text, /lock_timeout=5000/);
  assert.match(text, /app-state-history-migration\.sql/);
  assert.match(text, /u\.searchParams/);
  assert.match(text, /sslmode/);
  assert.match(text, /if: always\(\)/);
  assert.doesNotMatch(text, /supabase db reset|--file supabase\/schema\.sql/);
});

test("production target validation rejects libpq URI overrides without logging secrets", async () => {
  const workflow = parse(await readFile(new URL(".github/workflows/supabase-history-setup.yml", root), "utf8"));
  const step = workflow.jobs.setup.steps.find(step => step.name === "Install approved history migration atomically");
  const script = step.run.match(/node --input-type=module -e '([\s\S]*?)\n'\n/)?.[1];
  assert.ok(script);
  const base = "postgresql://postgres.tsfusbqmzmffdlneujny:synthetic%3F%24@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
  for (const [url, status] of [
    [base, 0], [base + "?sslmode=require", 0],
    [base + "?host=example.invalid", 1], [base + "?user=other", 1],
    [base + "?options=-c%20lock_timeout%3D0", 1], [base + "?sslmode=disable", 1],
    [base + "#fragment", 1], [base.replace("5432", "6543"), 1],
  ]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { SUPABASE_DB_URL: url } });
    assert.equal(result.status, status);
    assert.ok(!`${result.stdout}${result.stderr}`.includes("synthetic"));
  }
});

test("database permission checks exercise own writes and reject anonymous and cross-user writes", async () => {
  const sql = await readFile(new URL("scripts/restore-behavior-check.sql", root), "utf8");
  for (const message of ["Own update failed", "Own delete failed", "Own insert failed", "Cross-user insert was allowed", "Anonymous read was allowed", "Anonymous insert was allowed"]) {
    assert.ok(sql.includes(message), `Missing behavior assertion: ${message}`);
  }
  assert.match(sql, /SET LOCAL ROLE anon/);
  assert.match(sql, /set_config\('request\.jwt\.claim\.sub', '', true\)[\s\S]*SET LOCAL ROLE anon/);
  assert.match(sql, /ROLLBACK;/);
});
