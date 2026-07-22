# CONAN CARD Tracker

コナンカードゲーム向けの対戦記録アプリです。静的ファイルだけで動くため、GitHub Pages / Netlify / Vercel などに置けばスマホから外でも使えます。

- アプリ: https://genki1122.github.io/conan-card-tracker/
- 友人向け手引書: https://genki1122.github.io/conan-card-tracker/guide.html

## ローカル起動

```sh
python3 -m http.server 4174
```

ブラウザで `http://localhost:4174` を開きます。

## スマホで使う方法

1. このフォルダを静的サイトとして公開します。
2. スマホで公開URLを開きます。
3. iPhoneなら Safari の共有メニューから「ホーム画面に追加」します。
4. ログイン同期を使わない場合は、3点メニューの JSON コピー/インポートで端末間移行できます。

## データ保存

未ログイン時のデータはブラウザの `localStorage` に保存されます。Supabaseを設定してメールログインすると、PCとスマホで同じクラウドデータを参照できます。

## Supabase同期

1. Supabaseでプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。プロフィール、同意、管理者権限もこのSQLで作成されます。
3. Authentication > URL Configurationで、GitHub PagesのURLをSite URLとRedirect URLsに登録します。
4. Project Settings > APIから `Project URL` と `anon public` keyを控えます。
5. `src/supabase-config.js`へProject URLとPublishable keyを設定します。
6. 友人は手引書の「無料でユーザー登録」からメールアドレスを入力します。

`0harry0wilder0@gmail.com` で登録した利用者には `superadmin` が付与され、3点メニューから管理者画面を開けます。管理画面はRLSで保護され、一般利用者からは表示・参照できません。

`anon public` keyはブラウザで使う公開キーです。`service_role` keyは絶対にアプリやGitHubへ入れないでください。

## 友人へ共有する場合

公開URLはそのまま共有できます。ログインしない利用者のデータは各ブラウザ内だけに保存されます。

同じSupabaseプロジェクトを複数人で使う場合も、`app_states.user_id`とRLSにより各利用者のデータは分離されます。リンクを開くだけでメールログインできる状態にするには、次の準備が必要です。

1. `src/supabase-config.js`へProject URLとPublishable keyを設定します（このリポジトリでは設定済みです）。
2. Supabase AuthenticationのSite URLとRedirect URLsへ本番URLを正確に登録します。
3. 友人は自分のメールアドレスでログインします。
4. 少人数テストを超えて共有する前に、Authのメール送信上限を確認し、必要ならCustom SMTPを設定します。

日本語メール本文とCustom SMTPの設定項目は `supabase/email-setup.md` にまとめています。SMTPパスワードはGitHubへ保存せず、Supabase Dashboardへ直接入力してください。

Publishable keyはRLSを有効にしたブラウザアプリで公開するためのキーです。Secret keyと`service_role` keyは使用しません。新規利用者向けの空データ開始と利用案内は、一般共有前の対応項目です。
