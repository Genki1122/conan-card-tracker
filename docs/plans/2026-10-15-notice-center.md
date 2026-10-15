# Notice Center Implementation Plan

> **For Codex:** Use executing-plans and test-driven-development to implement this plan task-by-task.

**Goal:** Dismiss a notice permanently after its detail is closed, keep past notices accessible, and separate unread notices from pending app updates.

**Architecture:** Extend the existing release manifest and menu instead of creating another notification service. Track individual read versions in a separate localStorage key, preserving the legacy seen-version baseline. Only the latest available notice can appear in the bottom banner; old unread notices stay in the menu. No database or account-record changes.

**Tech Stack:** Vanilla JavaScript, native dialog, CSS, node:test, Playwright Chromium/WebKit.

## Agreed Behavior

- No automatic detail popup at startup. Announce the latest unread, publicly available release in the bottom banner.
- Mark only the displayed notice as read when its detail is closed or left via the back button. Opening the list, loading failures, or future scheduled notices do not mark anything read.
- A read notice stays hidden after reload and worker events, even if its app update is still pending. Do not replace it with an older unread notice.
- Rename the existing Update History entry to Notices (Japanese: お知らせ). Show newest-first dates, titles, and unread badges; each row opens a detail with a route back to the list.
- Keep pending update actions in the menu and notice list. Reuse network-only validation and retry handling from v58. Reading a notice never implies applying an update.
- Retain browser-local read state, as in the current app; cross-device read synchronization is outside this change.

## Tasks

1. **Read state:** Add failing tests to `test/release-notes.test.js`, run `node --test test/release-notes.test.js`, then implement version-specific reads and legacy migration in `src/release-notes.js`.
2. **Interaction:** Update the isolated scenarios in `scripts/update-banner-browser-check.mjs` first and confirm they fail. Implement explicit open/close handling, menu/list navigation, no startup popup, and shared update actions in `src/app.js` and `styles.css`. Preserve scheduled release gates and offline retry.
3. **Compatibility:** Update static expectations in `test/release-notes-ui.test.js` and the announcement scenario in `scripts/pass-picker-browser-check.mjs`. Add v59 metadata and align deployment versions in `index.html`, `src/app.js`, and `sw.js`.
4. **Verification:** Run all unit tests, both browser scripts, narrow-screen screenshots/overflow checks, and the real v58-to-v59 Service Worker upgrade. Assert local match data is preserved; stub all cloud access. Independently review the diff.
5. **Release:** Commit only these scoped changes, publish through existing Pages workflow, and verify deployed files match the tested revision. Leave unrelated reliability changes untouched.

## Status

- [x] Read state and migration
- [x] Notice list, detail lifecycle, and separate update action
- [x] Regression tests, visual checks, and review
- [ ] Publication and deployed-file verification (run after committing; deployment outcome is reported in the task)

## Verification Results

- 197 unit tests pass.
- 28 notice/update browser scenarios pass across Chromium and WebKit, including v58-to-v59 real Service Worker migration, separate pending updates, offline retry, scheduled visibility, and preservation of local match data.
- All 28 existing pass-picker browser scenarios pass.
- Inspected narrow-screen notice list, detail, and update-error screenshots. Layout checks pass at 320, 390, and 1024px.
- Independent review found no concrete P1/P2 regressions. No live user accounts or cloud data were used during testing.
