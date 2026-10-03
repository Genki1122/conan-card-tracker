# Admin Pass Picker Preview

- Keep the existing dropdowns for guests and regular accounts. Enable independent 1/2/3 checkboxes only for signed-in superadmins editing their own data.
- Keep the current two-column position inside match details, with no extra row in the normal state.
- Store combinations as existing-style strings (pass1, pass12, pass23, pass13, pass123). No database migration or bulk data rewrite.
- Preserve legacy pass-present records when unrelated fields are edited. Never infer their numbers.
- Share pass labels across history and X output. Count a passed match once regardless of the selected combination.
- Verify admin/non-admin access, save/reopen, legacy values, pending/bye rounds, all combinations, badges and X output. Check Chromium and WebKit at mobile widths using isolated test records.
- Deploy only this change from the clean published main baseline. Leave the separate unpublished reliability work intact. Add no general-user release announcement; general rollout awaits review.

## Approved Public Rollout

- Following administrator review, enable the same picker for regular and guest accounts. Other-account previews remain read-only.
- Publish release 57 with an in-app announcement, matching app/cache versions, and cached picker modules. Keep past release history.
- Verify regular/guest save and reopen, release details, seen-state persistence, and the update button in Chromium and WebKit before deployment.
- Provide an X announcement draft; do not post to X automatically.
