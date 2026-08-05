# Supabaseメール設定

## 日本語テンプレート

Supabase Dashboardの `Authentication > Email Templates` で設定します。

- Confirm sign up
  - Subject: `【CONAN CARD Tracker】ユーザー登録用コード`
  - Body: `supabase/templates/confirmation.html`
- Magic link or OTP
  - Subject: `【CONAN CARD Tracker】ログイン用コード`
  - Body: `supabase/templates/magic-link.html`

テンプレート内の `{{ .Token }}` はホーム画面アプリ内で認証するために必要です。移行期間中は旧画面からも認証できるよう、`{{ .ConfirmationURL }}` のリンクも残します。

### Dashboardへ反映

1. `Authentication > Email Templates` を開きます。
2. `Confirm sign up` を開き、SubjectとBodyを上記内容へ差し替えて保存します。
3. `Magic link or OTP` も同様に差し替えて保存します。
4. 新規登録画面から自分の別メールアドレスへ送信し、認証コードが本文に表示されることを確認します。
5. iPhoneのホーム画面アプリへコードを省略せず入力し、そのアプリ内でログイン状態になることを確認します。

## Custom SMTP

友人へ公開する場合、Supabase標準メールは1プロジェクト全体で現在2通/時のため、Custom SMTPを設定します。アプリ側のコード変更は不要です。Dashboardの `Authentication > SMTP Settings` で有効化し、利用するメール配信サービスから次の値を入力します。

- Sender name: `CONAN CARD Tracker`
- Sender email: 配信サービスで認証済みの送信元アドレス
- Host
- Port
- Username
- Password

SMTPパスワード、Supabase Secret key、service_role keyはリポジトリやブラウザコードへ保存しません。設定後は `Authentication > Rate Limits` で送信上限を確認し、自分のアドレスで新規登録と再ログインを各1回試します。件名・迷惑メール判定・スマホの遷移先まで確認してください。

設定にはSMTPサービス側で発行したHost、Port、Username、Passwordと、認証済みの送信元メールアドレスが必要です。これらが未発行の場合は、先にResend、Brevo、PostmarkなどのSMTP対応サービスでアカウントと送信元を準備します。
