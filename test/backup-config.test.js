import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
