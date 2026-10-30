# Reliability Priorities Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make backups operable, prevent confusing logout/sync actions, and gate deployment on tests without publishing an in-app announcement.

**Architecture:** Keep the existing scoped local storage and optimistic cloud writes. Add small tested presentation/guard helpers, isolated browser checks, and a reusable verification workflow. Increment the deployed asset version but preserve the announcement history unchanged.

**Tech Stack:** ES modules, Node test runner, Playwright Chromium/WebKit, GitHub Actions, Supabase CLI and GPG.

## 1. Backup Readiness

- [x] Inspect live run logs and secret names without reading credentials. Both required secrets are absent.
- [x] Test and implement `scripts/backup-preflight.sh`: list all missing settings, validate PostgreSQL URL and minimum passphrase length, never print values.
- [x] Update `.github/workflows/supabase-backup.yml`: checkout, preflight, verify complete decrypted archive against original, job summaries, temporary-file cleanup.
- [x] Update `docs/backup-and-restore.md` with exact setup links and explicit restoration evidence checklist.
- [ ] After owner supplies secrets: run backup, verify encrypted artifact, and perform an isolated restore rehearsal. Never restore into production or reset its credentials. Temporary project creation and credentials require owner coordination.

Tests: `node --test test/backup-config.test.js`; shell syntax and real local GPG round-trip where available. Configuration/SQL file presence is not proof that production backups or state-history triggers are active.

## 2. Account And Sync UX

- [x] Add failing `test/account-ux.test.js` and isolated browser checks for guest login, signup, email failure, OTP, sync retry, logout cancellation, and pending/clean logout.
- [x] Add `src/account-ux.js` for guidance and logout guards. Make existing login visible by default; retain a clear signup entry and direct onboarding signup.
- [x] Update `src/app.js` and `styles.css`: show last confirmed sync, separate logout from sync actions, require confirmation, block logout while unsynced/conflicted/saving, and offer a non-destructive retry/check action. Keep submitted email when sending fails.
- [x] Improve `src/auth-feedback.js` messages for provider configuration and rate limits without claiming mail delivery or exposing account existence.
- [x] Preserve account-scoped local data, anonymous data and cloud conflict checks; do not implement automatic destructive merging.

Tests: unit suite, browser flows at 320/390px in Chromium/WebKit. Existing pass/catalog/update checks remain green. Real phone and SMTP delivery are separate manual checks, not implied by mocks.

## 3. Deployment Gate And Silent Release

- [x] Pin Playwright dev dependency and lockfile. Add `npm run test:browser` for isolated checks.
- [x] Add `.github/workflows/checks.yml` for PRs and reuse it from Pages. `deploy` must depend on verification success; no `continue-on-error` or always-deploy bypass.
- [x] Add failing deployment-config and silent-release tests. Keep announcement history at v60 while deploying v61; old read notices must not reappear.
- [x] Update app/SW version references and currentVersion only. No v61 announcement, X post, or new automated user notification.
- [x] Verify locally, request independent review, publish, watch CI and Pages, compare live assets.

Verification (2026-10-30): 212 unit/configuration tests and 136 isolated Chromium/WebKit scenarios passed. A synthetic GPG round-trip matched the source archive and rejected altered archive bytes. Independent review findings about initialization-time sync and reused signup consent were reproduced, fixed, and re-reviewed. Commit `ea5fce4` passed the new verification gate and Pages deployment in [run 41022776342](https://github.com/Genki1122/conan-card-tracker/actions/runs/41022776342); live app, styles, service worker, and manifest matched local source. No v61 announcement was added. Production backup/restore and physical-device checks remain unverified.

## Owner Dependencies

- `SUPABASE_DB_URL` and `BACKUP_ENCRYPTION_PASSPHRASE` must be entered privately in GitHub Actions Secrets.
- SMTP settings, delivery logs, production history migration, and a temporary restore target cannot be confirmed from repository code alone.
- Keep incomplete operational checks explicitly incomplete, even when code tests pass.
