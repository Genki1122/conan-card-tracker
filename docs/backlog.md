# Product Backlog

## Data Correction

- Allow correcting the deck and deck version on an existing session.
- Add confirmation or a short undo action when deleting a match.
- Add rename, merge, and delete operations for environments with affected-session counts.
- Add store-name merge support so spelling variants do not split the store archive.

## Analysis

- Allow environment and store filtering while `All decks` is selected.
- Preserve the expanded analysis filter panel while selecting several conditions.
- Preserve useful filter state when moving between bottom-navigation tabs.

## Progressive Entry

- Show staff rock-paper-scissors fields only when the random-prize method is rock-paper-scissors.
- Prevent accidental `Unspecified` environment records by supporting an explicit active environment or requiring selection.

## Sharing Readiness

- Replace sample first-run records with an empty, friend-ready onboarding state.
- Bundle the Supabase Project URL and Publishable key after the owner approves public configuration.
- Verify production Site URL and Redirect URLs before inviting users.
- Configure Custom SMTP if the built-in Supabase email provider becomes a login bottleneck.
- Tighten RLS policies with an explicit `to authenticated` role when the schema is next revised.
