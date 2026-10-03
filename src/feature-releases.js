export const MONTHLY_REPORT_RELEASE_AT = "2026-08-30T20:00:00+09:00";

export function canUsePassPicker({ signedIn = false, role = "", adminPreview = false } = {}) {
  return signedIn && role === "superadmin" && !adminPreview;
}

const monthlyReportReleaseTime = Date.parse(MONTHLY_REPORT_RELEASE_AT);

export function canAccessMonthlyReport({ now = new Date(), role = "", adminPreview = false } = {}) {
  if (adminPreview) return false;
  return role === "superadmin" || toTime(now) >= monthlyReportReleaseTime;
}

export function millisecondsUntilMonthlyReportRelease(now = new Date()) {
  return Math.max(0, monthlyReportReleaseTime - toTime(now));
}

function toTime(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Date.now();
}
