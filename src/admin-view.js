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
