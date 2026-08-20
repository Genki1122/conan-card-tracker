const emptyState = () => ({
  decks: [],
  sessions: [],
  environments: [],
  matches: []
});

export function beginAdminPreview(ownState, user, remote) {
  return {
    userId: user.userId,
    username: user.username || "未設定",
    updatedAt: remote?.updated_at || "",
    ownState,
    viewedState: remote?.data || emptyState()
  };
}

export function endAdminPreview(preview) {
  return preview?.ownState || emptyState();
}

export function duplicateAdminUsers(rows = [], targetUserId = "") {
  const target = rows.find((row) => row.userId === targetUserId);
  const normalizedName = normalizeAdminUsername(target?.username);
  if (!normalizedName) return [];
  return rows
    .filter((row) => row.userId !== targetUserId && normalizeAdminUsername(row.username) === normalizedName)
    .sort((left, right) => String(right.lastUpdated || right.createdAt || "")
      .localeCompare(String(left.lastUpdated || left.createdAt || "")));
}

export function adminAccountDeletionState({
  target,
  retained,
  currentUserId = "",
  confirmationUsername = ""
} = {}) {
  if (!target?.userId) return blocked("削除対象を確認できません");
  if (target.userId === currentUserId) return blocked("管理者本人は削除できません");
  if (target.isAdmin) return blocked("管理者アカウントは削除できません");
  if (hasStoredAccountData(target)) return blocked("記録があるアカウントは削除できません");
  if (!retained?.userId
    || retained.userId === target.userId
    || normalizeAdminUsername(retained.username) !== normalizeAdminUsername(target.username)) {
    return blocked("残すアカウントを確認してください");
  }
  if (normalizeAdminUsername(confirmationUsername) !== normalizeAdminUsername(target.username)) {
    return blocked("削除対象のユーザー名を入力してください");
  }
  return { allowed: true, reason: "" };
}

function hasStoredAccountData(row) {
  const recovery = row.recovery || {};
  return Number(row.decks || 0) > 0
    || Number(row.storedSessions ?? row.sessions ?? 0) > 0
    || Number(row.storedMatches ?? row.matches ?? 0) > 0
    || Boolean(recovery.active)
    || Number(recovery.decks || 0) > 0
    || Number(recovery.sessions || 0) > 0
    || Number(recovery.matches || 0) > 0;
}

function normalizeAdminUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("ja");
}

function blocked(reason) {
  return { allowed: false, reason };
}
