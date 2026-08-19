# Session Related Link Implementation Plan

**Goal:** Allow one optional HTTP(S) URL to be saved on every session type and opened safely from the session detail screen without increasing list-card height.

**Architecture:** Keep URL parsing and validation in a small pure module. Store the normalized value on each session, collect it in the existing session form, and render a conditional external link only in the session detail metadata row. Existing sessions normalize to an empty value.

**Tech Stack:** Vanilla JavaScript ES modules, HTML/CSS, Node test runner, service worker, GitHub Pages.

---

### Task 1: Define URL behavior with tests

**Files:**
- Create: `src/session-links.js`
- Create: `test/session-links.test.js`

1. Add failing tests for blank values, trimmed HTTP(S) URLs, unsupported protocols, relative URLs, and malformed values.
2. Run the focused test and confirm it fails because the module does not exist.
3. Implement normalization and a Japanese validation message with `URL`.
4. Run the focused test and confirm it passes.

### Task 2: Persist and edit the session URL

**Files:**
- Modify: `src/app.js`
- Create: `test/session-related-link-ui.test.js`

1. Add failing source-level integration checks for legacy normalization, the optional form field, and session submit storage.
2. Normalize legacy sessions to `relatedUrl: ""`.
3. Add a collapsed `関連リンク` detail section to all session types; open it automatically while editing a session that already has a URL.
4. Validate before save and keep the form open with a Japanese message when invalid.
5. Save a normalized URL, or an empty string when the user clears it.

### Task 3: Render a safe, compact detail link

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/session-related-link-ui.test.js`

1. Add a failing check for conditional external-link markup.
2. Render `関連リンク ↗` only for valid stored URLs, in the existing metadata row.
3. Use `target="_blank"` and `rel="noopener noreferrer"`.
4. Add compact wrapping styles that do not affect sessions without a URL.
5. Keep deck-session list markup and X post generation unchanged.

### Task 4: Publish as app version 55

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `sw.js`
- Modify: `releases.json`
- Modify: `test/deployment-cache.test.js`
- Modify: `test/release-notes-ui.test.js`

1. Bump the unified deployment version to 55 and include the new module in the offline cache.
2. Add concise release notes for the optional session link.
3. Run all tests.

### Task 5: Verify mobile behavior and deploy

1. Start a local server and test create, edit, clear, invalid input, and external-link behavior.
2. Inspect screenshots at 320px and 390px widths for overlap and unwanted extra height.
3. Merge the branch into `main`, run tests again, push, and confirm GitHub Pages serves version 55.
