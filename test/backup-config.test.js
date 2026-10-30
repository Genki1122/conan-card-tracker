import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

const rootUrl = new URL("../", import.meta.url);

test("app state history keeps previous JSON for 30 days without client write access", async () => {
  const migration = await readFile(new URL("supabase/app-state-history-migration.sql", rootUrl), "utf8");

  assert.match(migration, /create table if not exists public\.app_state_versions/);
  assert.match(migration, /before update or delete on public\.app_states/);
  assert.match(migration, /old\.data/);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /alter table public\.app_state_versions enable row level security/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*app_state_versions/i);
});

test("daily backup encrypts the complete Supabase logical dump before uploading it", async () => {
  const workflow = await readFile(new URL(".github/workflows/supabase-backup.yml", rootUrl), "utf8");

  assert.match(workflow, /cron: "23 3 \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /schema\.sql"/);
  assert.match(workflow, /data\.sql" --use-copy --data-only/);
  assert.doesNotMatch(workflow, /--schema (public|auth)/);
  assert.match(workflow, /gpg[\s\S]*--symmetric/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /encrypted=.*\.tar\.gz\.gpg/);
  assert.match(workflow, /path: \$\{\{ steps\.backup\.outputs\.encrypted \}\}/);
  assert.doesNotMatch(workflow, /path: [^\n]*(\.sql|\.tar\.gz)\s*$/m);
});

function preflight(settings = {}) {
  return spawnSync("bash", [fileURLToPath(new URL("scripts/backup-preflight.sh", rootUrl))], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...settings },
  });
}

test("backup preflight reports all missing settings together", () => {
  const result = preflight();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SUPABASE_DB_URL/);
  assert.match(result.stdout, /BACKUP_ENCRYPTION_PASSPHRASE/);
  assert.match(result.stdout, /settings\/secrets\/actions/);
});

test("backup preflight validates configuration without echoing secrets", () => {
  const settings = {
    SUPABASE_DB_URL: "postgresql://postgres:synthetic-password@localhost:5432/postgres",
    BACKUP_ENCRYPTION_PASSPHRASE: "synthetic-test-passphrase-32-characters",
  };
  assert.equal(preflight(settings).status, 0);
  for (const invalid of [
    { SUPABASE_DB_URL: "https://example.invalid/private-key" },
    { SUPABASE_DB_URL: "postgresql://postgres:[YOUR-PASSWORD]@localhost/postgres" },
    { BACKUP_ENCRYPTION_PASSPHRASE: "too-short-secret" },
  ]) {
    const result = preflight({ ...settings, ...invalid });
    assert.equal(result.status, 1);
    for (const value of Object.values({ ...settings, ...invalid })) {
      assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
    }
  }
});

test("backup verifies the entire decrypted archive and cleans temporary files", async () => {
  const workflow = await readFile(new URL(".github/workflows/supabase-backup.yml", rootUrl), "utf8");
  assert.match(workflow, /bash scripts\/backup-preflight\.sh/);
  assert.match(workflow, /cmp -- /);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /name: Clean temporary backup files\s+if: always\(\)/);
  assert.doesNotMatch(workflow, /\| tar -tzf/);
});

test("actual workflow encryption and verification detect changed archive bytes", async t => {
  const gpg = spawnSync("gpg", ["--version"]);
  if (gpg.status !== 0) { t.skip("GPG unavailable; CI must run this check"); return; }
  const directory = await mkdtemp(join(tmpdir(), "conan-backup-test-"));
  const home = join(directory, "gnupg");
  try {
    const paths = { dir: join(directory, "dump"), archive: join(directory, "dump.tar.gz"), encrypted: join(directory, "dump.tar.gz.gpg"), verified: join(directory, "verified.tar.gz") };
    await mkdir(paths.dir);
    await mkdir(home, { mode: 0o700 });
    for (const file of ["roles.sql", "schema.sql", "data.sql", "manifest.json"]) await writeFile(join(paths.dir, file), "synthetic test fixture only\n");
    const workflow = parse(await readFile(new URL(".github/workflows/supabase-backup.yml", rootUrl), "utf8"));
    const run = name => {
      let script = workflow.jobs.backup.steps.find(step => step.name === name).run;
      for (const [key, value] of Object.entries(paths)) script = script.replaceAll(`\${{ steps.backup.outputs.${key} }}`, value);
      return spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, GNUPGHOME: home, BACKUP_ENCRYPTION_PASSPHRASE: "only-for-synthetic-test-fixtures-12345" },
      });
    };
    const encrypted = run("Encrypt backup");
    assert.equal(encrypted.status, 0, encrypted.stderr);
    const verified = run("Verify encrypted archive");
    assert.equal(verified.status, 0, verified.stderr);
    await appendFile(paths.archive, "corruption");
    assert.notEqual(run("Verify encrypted archive").status, 0);
  } finally {
    spawnSync("gpgconf", ["--homedir", home, "--kill", "gpg-agent"]);
    await rm(directory, { recursive: true, force: true });
  }
});
