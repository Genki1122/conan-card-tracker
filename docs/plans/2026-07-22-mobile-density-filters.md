# Mobile Density And Filters Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce vertical waste across tournament workflows while adding calendar-month player filtering, deck archiving, visible sync status, and a shorter data menu.

**Architecture:** Keep the static ES-module and JSON-state architecture. Add small pure analytics helpers for archive filtering and date labels, migrate decks with an `archived` default, and preserve filter state in the existing route object. Replace tall summaries with purpose-specific compact components and split the global data sheet into short navigation and focused sub-sheets.

**Tech Stack:** Static HTML/CSS/JavaScript, localStorage/Supabase JSON sync, Node test runner, Playwright mobile verification.

---

### Task 1: Data compatibility and pure helpers

**Files:**
- Modify: `src/analytics.js`
- Modify: `test/analytics.test.js`

1. Add failing tests for archive filtering, month-filtered player overviews, and year-aware date labels.
2. Run `npm test` and confirm the new tests fail for missing helpers.
3. Implement minimal pure helpers.
4. Run the complete test suite.

### Task 2: Player period and date context

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Add a compact calendar-month selector below the player search toolbar.
2. Filter player rows and player details with the selected month.
3. Preserve the month when opening and returning from details.
4. Show the year only for dates outside the current year.

### Task 3: Compact deck and session hierarchy

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Replace the deck-list summary with a compact record strip.
2. Reduce deck cards to a two-line, approximately 70px layout.
3. Replace the deck-detail summary with a compact strip.
4. Combine session record, outcome, metadata, and edit action into a compact header so rounds enter the first viewport.

### Task 4: Archive and progressive entry

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

1. Normalize legacy decks with `archived: false`.
2. Add active/archive switching to the deck list and an archive action to deck settings.
3. Exclude archived decks from new general session selection while retaining them in analysis and history.
4. Keep opponent deck/result/turn visible in match entry and move supplementary fields into an expandable section.

### Task 5: Sync visibility and focused menus

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `styles.css`

1. Add a small text sync indicator below the screen title.
2. Update it for local, unsigned, pending, saving, synced, offline, and conflict states.
3. Replace the long main menu with short rows leading to page settings, cloud settings, and data/environment settings.
4. Keep all existing destructive confirmations and cloud conflict controls.

### Task 6: Release verification

**Files:**
- Modify: `sw.js`

1. Bump the service-worker cache version.
2. Run syntax checks, all tests, and `git diff --check`.
3. Verify the deck, session, player, match-entry, archive, sync, and menu flows at 390px.
4. Commit, fast-forward to `main`, push, and verify the deployed cache version.
