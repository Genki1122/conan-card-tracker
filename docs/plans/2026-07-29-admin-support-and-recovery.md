# Admin Support And Recovery Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Safely merge anonymous device records into a signed-in account, give superadmins a searchable support-oriented user view, and let users repair missing match fields efficiently.

**Architecture:** Keep anonymous records on the device until the user confirms and the merged account state is saved to Supabase. Implement merging and quality selection as pure tested modules, then connect them to the existing single-page UI and cloud helpers. Store only recovery status counts in a new RLS-protected Supabase table so administrators can support users without receiving anonymous match content.

**Tech Stack:** Static ES modules, Node test runner, Supabase PostgreSQL/RPC, localStorage, GitHub Pages.

---

### Task 1: Anonymous-state merge engine

**Files:**
- Create: `src/account-recovery.js`
- Create: `test/account-recovery.test.js`
- Modify: `src/account-storage.js`

1. Write failing tests for anonymous-state detection, exact-ID merging, richer-record selection, ambiguous duplicate candidates, summaries, and preservation of both source states.
2. Run `node --test test/account-recovery.test.js` and confirm missing exports fail.
3. Implement pure preview and merge helpers. Do not mutate either input.
4. Run the focused test and then `npm test`.

### Task 2: Recovery status persistence

**Files:**
- Modify: `src/cloud.js`
- Modify: `supabase/schema.sql`
- Create: `supabase/account-recovery-migration.sql`
- Modify: `README.md`

1. Add SQL for `account_recovery_status`, user RLS, and privacy-safe admin RPC output.
2. Add cloud helpers to upsert and clear the current user's status.
3. Extend admin data loading to include status rows.
4. Verify SQL syntax by inspection and cloud module syntax with `node --check`.

### Task 3: Signed-in recovery UI

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `sw.js`

1. Detect retained anonymous or legacy state after account activation without deleting it.
2. Show a compact signed-in notification and a permanent entry under data management.
3. Render source/account counts, merged counts, and ambiguous duplicates in a confirmation view.
4. Back up both states as JSON, save the merged account state, wait for cloud success, then remove anonymous state and resolve status.
5. Preserve both states and show an actionable message on failure or conflict.

### Task 4: Administrator user operations

**Files:**
- Modify: `src/admin-analytics.js`
- Modify: `test/admin-analytics.test.js`
- Modify: `src/app.js`
- Modify: `styles.css`

1. Write failing tests for recovery status enrichment, issue-priority sorting, username search, status filters, and sort direction.
2. Implement pure user filtering and sorting.
3. Add a dedicated horizontally scrollable `利用者` tab.
4. Add sticky compact search, status, sort, and direction controls.
5. Show recovery, stale, and no-record status chips while keeping preview read-only.

### Task 5: Data-quality drilldown and user repair queue

**Files:**
- Create: `src/data-quality.js`
- Create: `test/data-quality.test.js`
- Modify: `src/admin-analytics.js`
- Modify: `test/admin-analytics.test.js`
- Modify: `src/app.js`
- Modify: `styles.css`

1. Write failing tests for missing-field detection, per-user quality rows, queue filtering, and next-record selection.
2. Implement shared field definitions and pure repair queue helpers.
3. Make administrator quality rows selectable and list affected users.
4. Load the selected user read-only and show only affected sessions and matches.
5. Add a one-line missing-data chip to personal analysis and a data-management entry.
6. Add a separate compact repair screen that opens the existing match editor and advances to the next missing record after save.

### Task 6: Verification and deployment

**Files:**
- Modify as required by fixes found during verification.

1. Run focused tests after every task.
2. Run `npm test`, `node --check src/app.js`, `node --check src/cloud.js`, and `git diff --check`.
3. Verify 320px and 390px layouts with Playwright, including sticky filters and repair navigation.
4. Review the complete diff for privacy leaks and destructive merge paths.
5. Commit, push, wait for GitHub Pages deployment, and verify the new service-worker cache version.
