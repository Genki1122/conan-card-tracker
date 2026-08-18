# X投稿のパス表記と更新案内 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** X投稿へパス情報を追加し、更新前後と3点メニューでリリース内容を確認できるようにする。

**Architecture:** 投稿文は既存の純粋関数へパス接尾辞を追加する。更新情報は `releases.json` と純粋なリリース判定モジュールで管理し、既存のサービスワーカー更新検知と共通ダイアログへ接続する。

**Tech Stack:** Vanilla JavaScript, HTML/CSS, Service Worker, Node.js test runner

---

### Task 1: X投稿のパス表記

**Files:**
- Modify: `test/session-share.test.js`
- Modify: `src/session-share.js`

**Step 1: Write the failing test**

パスなし、自分のみ、相手のみ、双方、不戦勝の期待文を追加する。

**Step 2: Run test to verify it fails**

Run: `node --test test/session-share.test.js`
Expected: FAIL because pass suffixes are missing.

**Step 3: Write minimal implementation**

UIと同じパスラベルを使い、使用時だけ `｜${labels.join("・")}` を対戦行へ加える。不戦勝は省略する。

**Step 4: Run test to verify it passes**

Run: `node --test test/session-share.test.js`
Expected: PASS.

### Task 2: リリース情報のモデル

**Files:**
- Create: `releases.json`
- Create: `src/release-notes.js`
- Create: `test/release-notes.test.js`

**Step 1: Write the failing test**

不正項目の除外、最新版取得、既読・未読判定、同一バージョンの再表示防止を記述する。

**Step 2: Run test to verify it fails**

Run: `node --test test/release-notes.test.js`
Expected: FAIL because the module does not exist.

**Step 3: Write minimal implementation**

リリース情報を正規化し、最新リリースと未読リリースを返す純粋関数を実装する。

**Step 4: Run test to verify it passes**

Run: `node --test test/release-notes.test.js`
Expected: PASS.

### Task 3: 更新バナーと詳細シート

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `styles.css`
- Create: `test/release-notes-ui.test.js`

**Step 1: Write the failing test**

バナーの概要、`内容` と `更新`、詳細シートの描画、取得失敗時の汎用表示を検証する。

**Step 2: Run test to verify it fails**

Run: `node --test test/release-notes-ui.test.js`
Expected: FAIL because release UI hooks are missing.

**Step 3: Write minimal implementation**

更新検知時にリリース情報を取得し、既存バナーを二操作へ拡張する。共通ダイアログに更新内容モードを追加する。

**Step 4: Run test to verify it passes**

Run: `node --test test/release-notes-ui.test.js`
Expected: PASS.

### Task 4: 更新後の一度表示と更新履歴

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/release-notes-ui.test.js`

**Step 1: Write the failing test**

未読の最新版だけを一度自動表示し、3点メニューから全履歴を開けることを検証する。

**Step 2: Run test to verify it fails**

Run: `node --test test/release-notes-ui.test.js`
Expected: FAIL because seen state and menu route are missing.

**Step 3: Write minimal implementation**

既読バージョンをローカル保存し、重要ダイアログへ割り込まない起動処理と更新履歴メニューを追加する。

**Step 4: Run test to verify it passes**

Run: `node --test test/release-notes-ui.test.js`
Expected: PASS.

### Task 5: 配信番号と総合検証

**Files:**
- Modify: `sw.js`
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `test/deployment-cache.test.js`

**Step 1: Write the failing test**

最新リリース番号とキャッシュ・モジュール番号が一致し、リリースJSONがキャッシュ対象であることを検証する。

**Step 2: Run test to verify it fails**

Run: `node --test test/deployment-cache.test.js`
Expected: FAIL until all versions and assets match.

**Step 3: Update deployment assets**

配信番号を更新し、`releases.json` と `src/release-notes.js` をサービスワーカーへ追加する。

**Step 4: Verify all tests and mobile UI**

Run: `npm test`
Expected: all tests pass.

Browser checks: 320px and 390px widths, no overlap or horizontal overflow, update details readable, menu history accessible.
