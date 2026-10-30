export function logoutBlockReason({ signedIn, dirty = false, conflict = false, busy = false }) {
  if (!signedIn) return "ログイン状態を確認してください。";
  if (busy) return "同期を確認中です。完了してからログアウトしてください。";
  if (conflict) return "端末とクラウドに異なる記録があります。同期する内容を確認してからログアウトしてください。";
  if (dirty) return "この端末に未同期の記録があります。クラウドへの保存を確認してからログアウトしてください。";
  return "";
}

export function syncRetryAction({ online, busy, dirty, conflict, updatedAt }) {
  if (!online) return "offline";
  if (busy) return "busy";
  if (dirty && !conflict && updatedAt) return "save";
  return "check";
}

export function syncGuidance({ online, busy, dirty, conflict, confirmedAt, error }) {
  if (conflict) return { title: "同期する内容の確認が必要です", detail: "自動上書きを停止しています。端末とクラウドの内容を確認してください。" };
  if (!online) return { title: "オフラインです", detail: "記録はこの端末に保存されます。接続が戻ってから同期を確認してください。" };
  if (busy) return { title: "同期を確認中です", detail: "完了するまで、この画面でお待ちください。" };
  if (dirty) return { title: "この端末に未同期の記録があります", detail: "端末には保存済みです。クラウドへの保存を再試行できます。" };
  if (error) return { title: "同期を確認できませんでした", detail: "記録を削除せず、接続状況を確認して再試行してください。" };
  if (!confirmedAt) return { title: "クラウドとの同期は未確認です", detail: "同期を確認して、保存状態を確かめてください。" };
  return { title: "クラウドと同期済みです", detail: "ログアウト後も、同じメールアドレスでログインして記録を確認できます。" };
}
