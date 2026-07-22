# Player Quick Lookup Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make player lookup fast during tournaments while keeping the normal player list compact.

**Architecture:** Add pure player-overview, recorded-RPS, sorting, and tone helpers in `src/analytics.js`. Use them in `src/app.js` for a compact searchable list and first-view player details, while migrating unknown player names to a single `不明` sentinel.

**Tech Stack:** Static ES modules, Node test runner, localStorage/Supabase JSON state, mobile-first CSS.

---

### Task 1: Tested player overview analytics

- Add failing tests for unknown-name exclusion, latest match context, recorded RPS percentages, sort direction, and 40-60% neutral tone.
- Implement the minimal analytics helpers and run the complete test suite.

### Task 2: Unknown player migration and match input

- Normalize blank, `未登録`, and `不明` to `不明`.
- Default new match player input to `不明` while retaining datalist completion and later editing.
- Exclude `不明` from player suggestions, lists, and player pivots.

### Task 3: Compact searchable player list

- Add a one-row search/sort/direction toolbar.
- Default to latest encounter descending.
- Use compact two-line cards normally and reveal latest deck plus recorded RPS distribution during search.
- Apply blue above 60%, gold from 40-60%, and red below 40%.

### Task 4: Player detail hierarchy

- Compact the summary and move rename into a small action.
- Put recorded RPS and recently used opponent decks in the first viewport.
- Add opponent-deck breakdown before compact history cards.

### Task 5: Verification and release

- Bump the service-worker cache.
- Run syntax checks, tests, diff checks, and 390px browser flows.
- Merge to main, push, and verify the deployed cache version.
