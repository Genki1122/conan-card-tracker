export function authEmailErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("rate limit") || error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return "メール送信の制限に達しています。連続で送信せず、時間をおいてお試しください。解消しない場合はアプリ管理者へ連絡してください。";
  }
  if (error?.code === "email_address_not_authorized" || message.includes("not authorized") || message.includes("smtp") || message.includes("sending confirmation email")) {
    return "認証メールを送信できませんでした。送信設定の確認が必要なため、アプリ管理者へ連絡してください。";
  }
  if (message.includes("invalid email")) {
    return "メールアドレスの形式を確認してください。";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "通信に失敗しました。接続状況を確認して、もう一度お試しください。";
  }

  return "メールを送信できませんでした。時間をおいて、もう一度お試しください。";
}

export function authOtpErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("expired") || message.includes("invalid") || message.includes("token")) {
    return "コードが正しくないか、有効期限が切れています。最新メールの認証コードを確認してください。";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "通信に失敗しました。接続状況を確認して、もう一度お試しください。";
  }

  return "認証できませんでした。認証コードを確認して、もう一度お試しください。";
}
