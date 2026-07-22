# CONAN CARD Tracker

コナンカードゲーム向けの対戦記録アプリです。静的ファイルだけで動くため、GitHub Pages / Netlify / Vercel などに置けばスマホから外でも使えます。

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
2. SQL Editorで `supabase/schema.sql` を実行します。
3. Authentication > URL Configurationで、GitHub PagesのURLをSite URLとRedirect URLsに登録します。
4. Project Settings > APIから `Project URL` と `anon public` keyを控えます。
5. アプリの3点メニュー > クラウド同期にURLとAnon keyを入力します。
6. メールアドレスを入力してログイン用メールを送ります。

`anon public` keyはブラウザで使う公開キーです。`service_role` keyは絶対にアプリやGitHubへ入れないでください。

## 友人へ共有する場合

公開URLはそのまま共有できます。ログインしない利用者のデータは各ブラウザ内だけに保存されます。

同じSupabaseプロジェクトを複数人で使う場合も、`app_states.user_id`とRLSにより各利用者のデータは分離されます。リンクを開くだけでメールログインできる状態にするには、次の準備が必要です。

1. `src/supabase-config.js`へProject URLとPublishable keyを設定します。
2. Supabase AuthenticationのSite URLとRedirect URLsへ本番URLを正確に登録します。
3. 友人は自分のメールアドレスでログインします。
4. 少人数テストを超えて共有する前に、Authのメール送信上限を確認し、必要ならCustom SMTPを設定します。

Publishable keyはRLSを有効にしたブラウザアプリで公開するためのキーです。Secret keyと`service_role` keyは使用しません。新規利用者向けの空データ開始と利用案内は、一般共有前の対応項目です。
