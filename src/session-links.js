const validationMessage = "http:// または https:// で始まるURLを入力してください";

export function normalizeSessionRelatedUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function sessionRelatedUrlValidationMessage(value) {
  const input = String(value || "").trim();
  return !input || normalizeSessionRelatedUrl(input) ? "" : validationMessage;
}
