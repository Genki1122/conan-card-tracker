# Bye Rounds Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Record tournament bye wins as official session rounds without polluting gameplay analysis.

**Architecture:** Add a backward-compatible `roundType` field to match records, defaulting legacy data to `played` and storing byes as `roundType: "bye"` with `result: "win"`. Separate official round summaries from played-match analytics, then reuse those boundaries in the session UI, X sharing, admin metrics, and AI export.

**Tech Stack:** Static ES modules, browser localStorage, Supabase JSON state sync, Node test runner, mobile-first CSS.

---

### Task 1: Round classification and summaries

**Files:**
- Modify: `src/analytics.js`
- Modify: `test/analytics.test.js`

1. Write failing tests proving that a bye counts in an official round summary but is excluded from `summarizeMatches`, pass rate, color matchups, opponent breakdowns, and player analysis.
2. Run the focused analytics tests and confirm they fail because bye helpers and official summaries do not exist.
3. Add `isByeRound`, `isPlayedMatch`, and `summarizeRounds`; make gameplay analytics consume only played matches.
4. Run the focused tests and confirm they pass.

### Task 2: Backward-compatible storage

**Files:**
- Modify: `src/app.js`
- Modify: `test/bye-rounds.test.js`

1. Write a failing source-level regression test for legacy normalization and sanitized bye fields.
2. Normalize missing `roundType` values to `played` and preserve only `bye` as the alternate value.
3. Save a bye with `result: "win"`, blank opponent and turn fields, unknown RPS, no passes, and an empty memo.
4. Verify editing a bye back to a played match restores normal validation.

### Task 3: Compact match-entry UI

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/bye-rounds.test.js`

1. Add `不戦勝` to the result selector.
2. When selected, hide player, turn, and detail fields; remove turn validation and show one compact analysis-exclusion note.
3. Preserve in-progress form values while toggling before save, but clear irrelevant values in the saved bye record.
4. Render a bye round without turn metadata or an empty details disclosure, while keeping the card editable.

### Task 4: Official session records and labels

**Files:**
- Modify: `src/app.js`
- Modify: `src/session-share.js`
- Modify: `test/session-share.test.js`

1. Use the official round summary for session headers, session status pills, and tournament/session lists.
2. Change session-level counts from `試合` to `ラウンド`; keep deck-level and analysis totals as actual `試合` counts.
3. Include byes in X-post records and render each as `－ ○｜不戦勝`.
4. Keep byes out of pending-round warnings.

### Task 5: Admin and AI boundaries

**Files:**
- Modify: `src/admin-analytics.js`
- Modify: `test/admin-analytics.test.js`

1. Write failing tests proving byes are neither pending matches nor AI-eligible matches and do not enter matchup analytics.
2. Classify byes as resolved rounds while retaining completed-match counts for real games only.
3. Ensure admin matchup, pass, player, color, and environment analytics use played matches only.
4. Run focused and full tests.

### Task 6: Mobile verification and release

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `sw.js`

1. Bump the deployment cache version consistently.
2. Run `npm test`, syntax checks, and `git diff --check`.
3. Verify at 320px, 390px, and 430px widths that selecting `不戦勝` collapses the form, saves without turn input, displays one compact round card, and does not create horizontal overflow.
4. Verify a played match still requires turn input and all analysis views exclude the bye.
5. Commit, push `main`, and confirm the GitHub Pages deployment succeeds.
