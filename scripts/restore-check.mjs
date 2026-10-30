import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const container = "supabase_db_restore-check";
const identifier = '"[A-Za-z_][A-Za-z0-9_]*"';
const copyHeader = new RegExp(`^COPY (${identifier}\\.${identifier}) \\((${identifier}(?:, ${identifier})*)\\) FROM stdin;$`);

export function parseCopyTables(dump) {
  const tables = [];
  let current;
  for (const line of dump.split("\n")) {
    if (current) {
      if (line === "\\.") current = undefined;
      else current.rows.push(line);
    } else if (line.startsWith("COPY ")) {
      const match = line.match(copyHeader);
      if (!match || tables.some(table => table.table === match[1])) throw new Error("Unsupported or duplicate COPY block");
      current = { table: match[1], columns: match[2], rows: [] };
      tables.push(current);
    }
  }
  if (current) throw new Error("Incomplete COPY block");
  return tables;
}

export function sameRows(expected, actual) {
  if (expected.length !== actual.length) return false;
  const hashes = rows => rows.map(row => createHash("sha256").update(row).digest("hex")).sort();
  const left = hashes(expected);
  const right = hashes(actual);
  return left.every((hash, index) => hash === right[index]);
}

export function localPsqlArgs(target = container, role = "postgres") {
  if (target !== container) throw new Error("Only the isolated restore container is allowed");
  if (!["postgres", "supabase_admin"].includes(role)) throw new Error("Only approved local database roles are allowed");
  return ["exec", "-i", container, "psql", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--username", role, "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=sqlstate", "--file", "-"];
}

export function configureDatabase(config, schema, data = "") {
  const sourceMajor = value => value.match(/^-- Dumped from database version (\d+)\./m)?.[1];
  const schemaMajor = sourceMajor(schema);
  const dataMajor = sourceMajor(data);
  const major = schemaMajor ?? dataMajor;
  if (!["14", "15", "16", "17"].includes(major)) throw new Error(`Unsupported or missing PostgreSQL version (schema=${schemaMajor ?? "missing"}, data=${dataMajor ?? "missing"})`);
  if (!/^project_id = "restore-check"$/m.test(config) || !/^major_version = \d+$/m.test(config)) throw new Error("Unexpected local database config");
  return config.replace(/^major_version = \d+$/m, `major_version = ${major}`);
}

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 300000 });
  // PostgreSQL errors may contain user records. Never forward stdout/stderr on failure.
  if (result.status !== 0) {
    const code = result.stderr?.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|$)/)?.[1];
    const phase = [...(result.stdout?.matchAll(/^RESTORE_PHASE_(ROLES|SCHEMA|DATA)$/gm) ?? [])].at(-1)?.[1];
    const line = result.stderr?.match(/psql:<stdin>:(\d+):/)?.[1];
    throw new Error(`Isolated database command failed${code ? ` (SQLSTATE ${code})` : ""}${phase ? ` in ${phase}` : ""}${line ? ` at input line ${line}` : ""}`);
  }
  return result.stdout;
}

function assertIsolated() {
  const output = docker(["inspect", container, "--format", "{{json .NetworkSettings.Networks}}"]);
  if (Object.keys(JSON.parse(output)).length !== 0) throw new Error("Restore database must have no network connections");
}

function psql(sql, transaction = false, role = "postgres") {
  assertIsolated();
  const args = localPsqlArgs(container, role);
  if (transaction) args.push("--single-transaction");
  return docker(args, sql);
}

async function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

async function verify(dumpDirectory, rehearseHistory = false) {
  const roles = await readFile(join(dumpDirectory, "roles.sql"), "utf8");
  const schema = await readFile(join(dumpDirectory, "schema.sql"), "utf8");
  const data = await readFile(join(dumpDirectory, "data.sql"), "utf8");
  const tables = parseCopyTables(data);
  for (const required of ['"auth"."users"', '"public"."profiles"', '"public"."app_states"']) {
    if (!tables.find(table => table.table === required)?.rows.length) throw new Error("Required account or record table is missing or empty");
  }
  await report("Restoring saved roles, schema and data into the disconnected temporary database.");
  psql(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;\n\\echo RESTORE_PHASE_ROLES\n${roles}\n\\echo RESTORE_PHASE_SCHEMA\n${schema}\n\\echo RESTORE_PHASE_DATA\nSET session_replication_role = replica;\n${data}\n`, true, "supabase_admin");
  await report("Database restore transaction committed successfully.");

  for (const { table, columns, rows } of tables) {
    const output = psql(`SET DateStyle = 'ISO'; SET TimeZone = 'UTC'; SET extra_float_digits = 3; SET bytea_output = 'hex';\nCOPY ${table} (${columns}) TO stdout;\n`);
    const restored = output === "" ? [] : output.replace(/\n$/, "").split("\n");
    if (!sameRows(rows, restored)) throw new Error(`Full-record comparison failed for ${table}`);
  }
  await report(`All ${tables.length} backed-up tables match: row counts and SHA-256 fingerprints of every record (including complete account JSON). No record contents are logged.`);

  if (rehearseHistory) {
    const migration = await readFile(new URL("../supabase/app-state-history-migration.sql", import.meta.url), "utf8");
    const verification = await readFile(new URL("history-setup-verify.sql", import.meta.url), "utf8");
    psql(`LOCK TABLE public.app_states IN SHARE ROW EXCLUSIVE MODE;\nCREATE TEMP TABLE history_setup_before ON COMMIT DROP AS SELECT user_id, md5(row(state.*)::text) AS fingerprint FROM public.app_states AS state;\n${migration}\n${verification}`, true);
    await report("REHEARSAL ONLY: applied the reviewed history migration to the disconnected clone. This does not confirm production installation.");
  }
  const metadata = JSON.parse(psql(`SELECT json_build_object(
    'historyTable', to_regclass('public.app_state_versions') IS NOT NULL,
    'historyTrigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.app_states') AND tgname = 'capture_app_state_version_before_change' AND tgenabled IN ('O', 'A')),
    'signupTrigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('auth.users') AND tgname = 'on_auth_user_created' AND tgenabled IN ('O', 'A'))
  );`));
  await report(`Saved-schema checks: history table ${metadata.historyTable ? "present" : "ABSENT"}; history trigger ${metadata.historyTrigger ? "enabled" : "ABSENT/DISABLED"}; custom signup trigger ${metadata.signupTrigger ? "present" : "not restored (managed Auth schema customizations require separate recovery)"}.`);
  const checks = await readFile(new URL("restore-behavior-check.sql", import.meta.url), "utf8");
  psql(checks);
  await report("Saved schema contains enabled history capture and row-level security. Update/delete history and account-isolation tests passed and were rolled back.");
  await report("Scope: database recovery from the selected backup. Hosted Auth login, SMTP delivery, external project settings and the next scheduled backup are NOT verified by this check.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "configure") {
      const schema = await readFile(process.argv[3], "utf8");
      const config = await readFile(process.argv[4], "utf8");
      const data = await readFile(join(process.argv[3], "../data.sql"), "utf8");
      await writeFile(process.argv[4], configureDatabase(config, schema, data));
    } else if (["verify", "rehearse-history"].includes(process.argv[2])) {
      await verify(process.argv[3], process.argv[2] === "rehearse-history");
    } else throw new Error("Unknown restore-check operation");
  } catch (error) {
    // Only fixed application messages and SQLSTATE codes are emitted; no raw database errors.
    const safe = /^(Unsupported|Unexpected|Incomplete|Only the|Restore database|Required account|Isolated database|Full-record|Unknown restore)/.test(error.message);
    await report(`Restore verification FAILED: ${safe ? error.message : "Operation failed; sensitive diagnostic output withheld"}`);
    process.exitCode = 1;
  }
}
