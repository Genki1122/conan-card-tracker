const accountStartValue = "account";
const usernameMinLength = 2;
const usernameMaxLength = 20;

export function accountOnboardingIntent(search) {
  return new URLSearchParams(search).get("start") === accountStartValue;
}

export function clearAccountOnboardingUrl(href) {
  const url = new URL(href);
  url.searchParams.delete("start");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authRedirectUrl(href) {
  const url = new URL(href);
  url.searchParams.delete("start");
  url.hash = "";
  return url.toString();
}

export function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < usernameMinLength || username.length > usernameMaxLength) {
    return "ユーザー名は2〜20文字で入力してください";
  }
  if (/[<>\\/]/.test(username)) return "ユーザー名に使用できない文字が含まれています";
  return "";
}
