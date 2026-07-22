const accountStartValue = "account";

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
