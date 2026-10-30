# Release checks

Pages now waits for `.github/workflows/checks.yml` to succeed. The same workflow runs on pull requests. A failure leaves the previous deployed site in place; fix the failure rather than removing the gate.

## Local checks

```sh
npm ci
npm test
npx playwright install chromium webkit
npm run test:browser
```

The browser checks use only isolated localhost records and stubbed cloud calls. They cover login and 8-digit OTP, mail failure, safe logout, sync conflicts, pass selection, card selection, and real service-worker updates. They do not prove actual email delivery or physical iPhone/Android behavior. No production credentials belong in these tests.

The update check reads an earlier committed service worker, so CI checkout uses full history. `PLAYWRIGHT_MODULE` optionally selects the bundled local runtime; CI uses the exact package version in the lockfile.

## Before publishing

- Confirm all local and Actions checks pass.
- For account or sync changes, manually verify Safari, iPhone Home Screen, and Android Chrome: enter a code in the same app, save, reopen, and check synchronization. Include offline edits and reconnecting.
- Check 320px and 390px screens, the software keyboard, large text settings, and long email/card/deck names. Browser emulation is not a substitute for real-device checks.
- For a silent improvement, increment the asset/cache version and `releases.json.currentVersion`, but do not add an announcement entry. Existing unread announcements remain valid; read announcements must not reappear. Updates remain accessible from the menu.
- For a public announcement later, add its entry only when the user authorizes it. Do not use a deployment version alone as a reason to notify.
- After publication, verify the Pages job succeeded and the live app, service worker, and manifest versions agree.

Backup success is independent of application test success. Check the backup workflow and complete the isolated restore drill in `backup-and-restore.md` before describing backups as verified.
