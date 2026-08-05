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

未ログイン時のデータはブラウザの `localStorage` に保存されます。ログイン後のローカルデータはユーザーIDごとに分離され、同じ端末で別の利用者へ切り替えても記録は混ざりません。未ログイン記録が残っている場合は統合内容を確認し、クラウド保存が成功してから元データを削除します。Supabaseを設定してメールログインすると、PCとスマホで同じクラウドデータを参照できます。

## Supabase同期

1. Supabaseでプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。プロフィール、同意、管理者権限もこのSQLで作成されます。
3. Authentication > URL Configurationで、GitHub PagesのURLをSite URLとRedirect URLsに登録します。
4. Project Settings > APIから `Project URL` と `anon public` keyを控えます。
5. `src/supabase-config.js`へProject URLとPublishable keyを設定します。
6. 友人はホーム画面へ追加したアプリの「無料でユーザー登録」からメールアドレスを入力し、メールに届く6桁コードで認証します。

`0harry0wilder0@gmail.com` で登録した利用者には `superadmin` が付与され、3点メニューから管理者画面を開けます。管理画面はRLSで保護され、一般利用者からは表示・参照できません。

管理者は利用者一覧から対象者を選び、その利用者のデッキ・分析・プレイヤー・大会画面を閲覧専用で確認できます。既に初回の `schema.sql` を実行済みの場合は、追加で `supabase/admin-preview-migration.sql` を実行します。

管理者の環境・対面・利用状況・データ品質集計を有効にするには、既存プロジェクトで `supabase/admin-analytics-migration.sql` を実行します。このRPCは相手プレイヤー名を返さず、名前が記録済みかどうかだけを集計用に返します。

未ログインデータの引き継ぎ状況を管理者画面へ表示するには、既存プロジェクトで `supabase/account-recovery-migration.sql` を実行します。管理者へ共有されるのは件数・重複候補数・進行状態だけで、未ログイン時の対戦内容は送信されません。

環境は全利用者共通のマスターから選択します。一般利用者は自由入力できず、superadminだけが追加・統合・名称変更・未使用環境の削除を行えます。既存プロジェクトでは追加で `supabase/environment-catalog-migration.sql` を実行してください。既存セッションにある環境名は自動でマスターへ登録されます。

`anon public` keyはブラウザで使う公開キーです。`service_role` keyは絶対にアプリやGitHubへ入れないでください。

## 友人へ共有する場合

公開URLはそのまま共有できます。ログインしない利用者のデータは各ブラウザ内だけに保存されます。

同じSupabaseプロジェクトを複数人で使う場合も、`app_states.user_id`とRLSにより各利用者のデータは分離されます。6桁コードでメールログインできる状態にするには、次の準備が必要です。

1. `src/supabase-config.js`へProject URLとPublishable keyを設定します（このリポジトリでは設定済みです）。
2. Supabase AuthenticationのSite URLとRedirect URLsへ本番URLを正確に登録します。
3. `supabase/email-setup.md`に従って、Confirm sign upとMagic link or OTPの本文へ`{{ .Token }}`を含むテンプレートを設定します。
4. 友人は自分のメールアドレスへ届いた6桁コードを、ホーム画面アプリへ入力します。
5. 少人数テストを超えて共有する前に、Authのメール送信上限を確認し、必要ならCustom SMTPを設定します。

日本語メール本文とCustom SMTPの設定項目は `supabase/email-setup.md` にまとめています。SMTPパスワードはGitHubへ保存せず、Supabase Dashboardへ直接入力してください。

Publishable keyはRLSを有効にしたブラウザアプリで公開するためのキーです。Secret keyと`service_role` keyは使用しません。
