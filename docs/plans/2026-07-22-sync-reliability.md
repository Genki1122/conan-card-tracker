# Sync Reliability Design

## Goal

Prevent silent data loss across devices, recover pending offline changes, and make deployed updates visible on mobile.

## Design

- Persist a local dirty flag and the last acknowledged cloud timestamp separately from app data.
- Mark every local mutation dirty before scheduling cloud work.
- Clear dirty state only after a confirmed cloud write or an explicit remote-state choice.
- Compare normalized local and remote states on login and manual download.
- Stop automatic writes when states differ and show record counts for both choices.
- Retry dirty data after connectivity returns, using the last cloud timestamp for conflict protection.
- Detect a newly activated service worker and present an explicit reload action.

Automatic field-level merging is deferred until entities have per-record update timestamps. Choosing a whole state is safer than guessing which edit should win.
