# Data Safety and Master Data

## Scope

- Separate browser data by authenticated user ID.
- Move anonymous records into the first account used to register, once.
- Show an empty anonymous state after logout.
- Allow correcting the deck and deck version on an existing session.
- Confirm before deleting a match.
- Merge store-name variants across the current user's sessions.
- Let only superadmins manage the shared environment catalog.
- Let signed-in users change their profile username.

## Environment Catalog

`environment_catalog` is readable by all app users. Insert, update, and delete policies require `is_superadmin()`. Security-definer RPCs repeat the superadmin check and handle usage counts, additions, global renames or merges, and deletion of unused entries.

Renaming an environment updates every matching session in `app_states`. A client with stale data will hit the existing optimistic-lock conflict instead of silently restoring an old environment name.

## Local Storage

State and sync metadata use keys scoped to `user:<uuid>` or `anonymous`. Existing unscoped state is moved once into the first authenticated scope. Async cloud operations capture a storage epoch so a response started under one account cannot mutate another account's active browser state.

## Mobile UI

Session creation uses a compact environment select. Environment management remains inside the existing data sheet. General users see only available choices; superadmins see compact rows with usage count, rename, and delete controls. In-use environments cannot be deleted and must be merged or renamed instead.
