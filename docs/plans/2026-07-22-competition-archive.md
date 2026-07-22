# Competition Archive Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add compact monthly/all-deck analysis, player renaming, recency-sorted decks, tournament results, and store random-prize archives without increasing mobile screen height unnecessarily.

**Architecture:** Extend the existing local/Supabase state with backward-compatible session and deck fields. Keep calculations in `src/analytics.js` as pure functions, then render compact controls and cards from `src/app.js`; no database schema change is required because Supabase stores the app state as JSON.

**Tech Stack:** Static ES modules, browser localStorage, Supabase JSON state sync, Node test runner, mobile-first CSS.

---

### Task 1: Analytics primitives

**Files:**
- Modify: `src/analytics.js`
- Modify: `test/analytics.test.js`

1. Write failing tests for calendar-month filtering, own-deck/month pivots, and staff RPS breakdown grouped by first, second, and third hand.
2. Run `npm test` and confirm failures are caused by missing exports/behavior.
3. Implement `filterMatchesByMonth`, month-aware cross breakdown values, and `getStaffRpsBreakdown` with independent denominators per hand position.
4. Run `npm test` and confirm all tests pass.

### Task 2: Backward-compatible state model

**Files:**
- Modify: `src/app.js`

1. Extend deck normalization with `createdAt` and `lastUsedAt`.
2. Extend session normalization with `placement`, `placementNote`, `randomPrizeWon`, `randomPrizeMethod`, `randomPrizeMethodNote`, and a three-item `staffRpsHands` array.
3. Preserve old records by supplying empty/default values during normalization.
4. Update deck/session writes so timestamps and tournament fields persist through local and cloud sync.

### Task 3: Player rename and deck ordering

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Add a player-detail action that renames all matching histories and merges into an existing player name when needed.
2. Sort decks by most recent session/use, then creation time.
3. Keep match-level editing available for correcting only one record.
4. Verify empty names and `未登録` cannot become player entities.

### Task 4: Compact analysis filters

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Add `全デッキ` and calendar month selection while preserving `全期間`, current month, and previous month shortcuts.
2. Replace stacked filter rows with a compact primary filter bar and a collapsible detail filter area.
3. Add own-deck and month pivots and ensure unavailable dependent filters reset safely.
4. Keep selected filters visible without adding permanent vertical rows.

### Task 5: Tournament results and compact sessions

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Add tournament fields to session editing, with placement choices `優勝／2位／ベスト4／その他／未記録`.
2. Disable and clear random-prize win state for champions while still allowing archive method/hands entry.
3. Record random-prize method and up to three sequential staff hands.
4. Replace the fixed session badge with a two-line compact card.
5. Show only `優勝／2位／ベスト4／ランダム` chips in deck session lists; hide `その他／未記録`.

### Task 6: Store archive

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/analytics.test.js`

1. Add `セッション／店舗` switching inside the tournament tab.
2. Group sessions by store name and show event count plus method history.
3. Add store detail with three compact segmented bars for staff hand position probabilities and per-position sample counts.
4. Show session history and permit opening existing session details from the archive.

### Task 7: Mobile verification and release

**Files:**
- Modify: `sw.js`

1. Bump the service-worker cache version.
2. Run `node --check src/app.js`, `node --check src/analytics.js`, `npm test`, and `git diff --check`.
3. Start a local server and verify 390px mobile flows: player rename, monthly/all-deck analysis, compact sessions, tournament editing, and store archive.
4. Check browser console warnings/errors.
5. Commit, merge to `main`, push, and verify the deployed cache version.
