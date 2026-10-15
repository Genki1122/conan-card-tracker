# Update Banner Repair

- Published v57 displays the update banner on worker lifecycle events without checking the running version. Reading details records a seen version but does not hide the banner.
- Separate deployment updates (manifest currentVersion greater than appVersion) from unread announcements, including scheduled announcements shipped in advance.
- Refresh metadata on update checks, never mark reading notes as applying an update, and hide announcements after reading them. Preserve the actual update button while older code is running.
- Reload only for a verified newer deployment. On network failure keep the user on the current page with a retry message.
- Explicit update checks use a unique network-only metadata URL, separate from background checks, so a worker's offline fallback cannot trigger a reload. Scheduled notes remain hidden until their availability time, even when their code is already deployed.
- Test repeated worker events, deferred announcements, reading notes before updating, cached metadata, failure/retry, and a real v57-to-fixed service-worker upgrade in Chromium and WebKit. Preserve all test record storage.
- Keep unrelated unpublished reliability work out of this release. No database or account-data changes.

## Verification

- Unit suite: 193 passing tests.
- Chromium and WebKit: 16 update scenarios pass, including real Service Worker upgrades from published v57, scheduled announcements, and network errors with a newer manifest already cached. All 28 existing pass-picker scenarios also pass with the revised announcement flow.
- Independent review: the scheduled-note leak and offline-cache edge cases were reproduced and fixed; no remaining concrete P1/P2 regressions were found on re-review.
- The upgrade checks assert that stored match IDs, pass selections, and a separate storage sentinel survive. All cloud access is stubbed; no real account records are used.
- iPhone hardware confirmation remains with the reporting user after deployment. Do not ask them to clear website data or log out.
