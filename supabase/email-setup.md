# Supabaseメール設定

## 日本語テンプレート

Supabase Dashboardの `Authentication > Email Templates` で設定します。

- Confirm signup
  - Subject: `【CONAN CARD Tracker】ユーザー登録を完了してください`
  - Body: `supabase/templates/confirmation.html`
- Magic Link
  - Subject: `【CONAN CARD Tracker】ログイン用リンクをお送りします`
  - Body: `supabase/templates/magic-link.html`

テンプレート内の `{{ .ConfirmationURL }}` は変更しません。

## Custom SMTP

友人へ公開する場合、Supabase標準メールは試用向けの制限があるためCustom SMTPを設定します。Dashboardの `Project Settings > Authentication > SMTP Settings` で有効化し、利用するメール配信サービスから次の値を入力します。

- Sender name: `CONAN CARD Tracker`
- Sender email: 配信サービスで認証済みの送信元アドレス
- Host
- Port
- Username
- Password

SMTPパスワード、Supabase Secret key、service_role keyはリポジトリやブラウザコードへ保存しません。設定後は自分のアドレスで新規登録と再ログインを各1回試し、迷惑メール判定とスマホの遷移先を確認します。
