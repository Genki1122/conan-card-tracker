# Session Record Types Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** チャレンジ戦・フリー対戦・調整対戦をセッション単位で分離し、記録・分析・プレイヤー・管理者画面で一貫して扱えるようにする。

**Architecture:** `src/record-types.js`を種別の単一情報源にし、既存セッションは正規化時にチャレンジ戦へ移行する。対戦の種別はセッションから付加したenriched matchで集計し、公式大会機能はチャレンジ戦だけへ限定する。

**Tech Stack:** Vanilla JavaScript ES modules、HTML/CSS、Node.js test runner、GitHub Pages。

---

### Task 1: 共通種別定義と互換性

**Files:**
- Create: `src/record-types.js`
- Create: `test/record-types.test.js`
- Modify: `src/app.js`

1. 種別の正規化・ラベル・フィルターを期待する失敗テストを書く。
2. `node --test test/record-types.test.js`で未実装による失敗を確認する。
3. `challenge / free / tuning / all`の共通ヘルパーを実装する。
4. 既存セッションを`challenge`へ正規化する。
5. 対象テストを再実行し、成功を確認する。

### Task 2: セッション登録と公式大会境界

**Files:**
- Modify: `src/app.js`
- Modify: `src/session-share.js`
- Modify: `test/session-share.test.js`
- Modify: `styles.css`

1. 種別変更時の大会固有項目クリアと、X投稿対象を表す失敗テストを書く。
2. 失敗を確認後、フォーム先頭の種別選択と条件表示を実装する。
3. 選択中タブから新規セッション種別を引き継ぐ。
4. X投稿をチャレンジ戦だけに限定する。
5. 対象テストを通す。

### Task 3: デッキ詳細タブと4指標

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/analytics.test.js`
- Modify: `test/record-types.test.js`

1. 種別ごとのセッション・対戦集計と既定チャレンジ表示の失敗テストを書く。
2. デッキ選択画面の戦績をチャレンジ戦限定にする。
3. デッキ詳細に4指標と3タブを実装する。
4. 戻る操作と`＋`で選択種別を維持する。
5. 対象テストを通す。

### Task 4: 分析フィルター

**Files:**
- Modify: `src/analytics.js`
- Modify: `src/app.js`
- Modify: `test/analytics.test.js`

1. 種別フィルターと他条件との組み合わせを期待する失敗テストを書く。
2. enriched matchへセッション種別を付加する。
3. 分析詳細条件へ4択を追加し、既定値をチャレンジ戦にする。
4. 全分析ピボットが同じ母集団を使うことをテストする。

### Task 5: プレイヤー一覧・詳細

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `test/analytics.test.js`
- Modify: `test/record-types.test.js`

1. 一覧条件の継承と全種別履歴ラベルを表す失敗テストを書く。
2. プレイヤー一覧に種別プルダウンを追加する。
3. 詳細画面に4択タブを追加し、全セクションを再集計する。
4. `すべて`の履歴だけ種別チップを表示する。
5. 戻る操作で全条件を維持する。

### Task 6: 大会・店舗・管理者・AI

**Files:**
- Modify: `src/app.js`
- Modify: `src/admin-analytics.js`
- Modify: `test/admin-analytics.test.js`

1. フリー・調整が大会／店舗集計から除外され、AI特徴量には種別が残る失敗テストを書く。
2. 大会一覧と店舗アーカイブをチャレンジ戦限定にする。
3. 管理者フィルターへ種別を追加する。
4. AIデータへ匿名の種別特徴量を追加する。
5. 対象テストを通す。

### Task 7: 配信とモバイル検証

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `sw.js`
- Modify: `test/deployment-cache.test.js`（必要な場合）

1. 配信キャッシュ番号を更新し、新モジュールをService Workerへ追加する。
2. `npm test`、`node --check`、`git diff --check`を実行する。
3. 320px、390px、430pxで登録・タブ・分析・プレイヤー・大会を操作確認する。
4. `main`へ反映してGitHub Pagesの成功と公開ファイルを確認する。

