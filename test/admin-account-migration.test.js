import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/admin-account-management-migration.sql", import.meta.url), "utf8");

test("admin account deletion is guarded and audited on the server", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /public\.is_superadmin\(\)/i);
  assert.match(sql, /target_user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /from public\.admin_users/i);
  assert.match(sql, /from auth\.users where id = target_user_id for update/i);
  assert.match(sql, /jsonb_array_length/i);
  assert.match(sql, /insert into public\.admin_audit_logs/i);
  assert.match(sql, /delete from auth\.users/i);
});
