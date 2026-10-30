# Reliability Priorities Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make backups operable, prevent confusing logout/sync actions, and gate deployment on tests without publishing an in-app announcement.

**Architecture:** Keep the existing scoped local storage and optimistic cloud writes. Add small tested presentation/guard helpers, isolated browser checks, and a reusable verification workflow. Increment the deployed asset version but preserve the announcement history unchanged.

**Tech Stack:** ES modules, Node test runner, Playwright Chromium/WebKit, GitHub Actions, Supabase CLI and GPG.

## 1. Backup Readiness

- [x] Inspect live run logs and secret names without reading credentials. Both required secrets were absent at the start of the audit; the owner subsequently configured them privately.
- [x] Test and implement `scripts/backup-preflight.sh`: list all missing settings, validate PostgreSQL URL and minimum passphrase length, never print values.
- [x] Update `.github/workflows/supabase-backup.yml`: checkout, preflight, verify complete decrypted archive against original, job summaries, temporary-file cleanup.
- [x] Update `docs/backup-and-restore.md` with exact setup links and explicit restoration evidence checklist.
- [x] After owner supplies secrets: run backup and verify encrypted artifact. [Run 41027199973](https://github.com/Genki1122/conan-card-tracker/actions/runs/41027199973) succeeded; decrypt/compare and upload verified.
- [x] Perform an isolated database restore. [Normal restore check 41034355128](https://github.com/Genki1122/conan-card-tracker/actions/runs/41034355128) passed using the post-installation backup: all 41 tables matched, history/RLS/cascade behavior passed, and cleanup completed. Hosted Auth/project recovery remains a separate owner-approved check. Production was not a restore destination.
- [x] Obtain approval and enable previously missing production history capture after backup and rehearsal. Verify unchanged existing records. Include parent-account cascade deletion in the rehearsal to prevent a history-trigger regression.
- [ ] Confirm the first scheduled backup after setup.

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

Verification (2026-10-30, initial reliability release): 212 unit/configuration tests and 136 isolated Chromium/WebKit scenarios passed. A synthetic GPG round-trip matched the source archive and rejected altered archive bytes. Independent review findings about initialization-time sync and reused signup consent were reproduced, fixed, and re-reviewed. Commit `ea5fce4` passed the new verification gate and Pages deployment in [run 41022776342](https://github.com/Genki1122/conan-card-tracker/actions/runs/41022776342); live app, styles, service worker, and manifest matched local source. No v61 announcement was added. Subsequent backup/history operations are recorded in `docs/backup-and-restore.md`. Physical-device checks remain unverified.

## Owner Dependencies

- The owner configured `SUPABASE_DB_URL` and `BACKUP_ENCRYPTION_PASSPHRASE` privately in GitHub Actions Secrets. Keep the encryption passphrase independently in the password manager.
- Production history installation was approved and verified. Hosted Auth/SMTP/project recovery still needs a separately approved temporary project; the isolated database check does not cover these services.
- The first scheduled backup check is reserved for 2026-10-31 at 06:00 JST; a successful manual backup does not prove scheduled execution.
- Keep incomplete operational checks explicitly incomplete, even when code tests pass.
