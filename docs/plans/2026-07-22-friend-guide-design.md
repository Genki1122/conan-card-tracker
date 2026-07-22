# Friend Guide Design

## Purpose

Give a first-time mobile user enough information to record their first tournament without reading developer documentation.

## Format

- Publish a standalone mobile HTML page at `/guide.html` so the owner can share one URL.
- Match the tracker visual language while keeping sections compact and easy to scan.
- Add a `使い方` row to the in-app data menu for later reference.

## Content Order

1. Add the app to the home screen.
2. Register a deck and tournament.
3. Record a match with the minimum required context.
4. Review analysis, players, tournaments, and stores.
5. Explain local storage, cloud sync, backup, and conflict handling.

The guide must distinguish local-only use from cloud sync because the public build does not bundle Supabase configuration yet.
