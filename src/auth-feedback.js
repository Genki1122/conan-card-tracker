export function authEmailErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("rate limit")) {
    return "短時間にメールを複数回送信したため、現在送信できません。しばらく待ってから、もう一度お試しください。";
  }
  if (message.includes("invalid email")) {
    return "メールアドレスの形式を確認してください。";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "通信に失敗しました。接続状況を確認して、もう一度お試しください。";
  }

  return "メールを送信できませんでした。時間をおいて、もう一度お試しください。";
}
