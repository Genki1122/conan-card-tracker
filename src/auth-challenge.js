const authChallengeStorageKey = "conan-card-tracker-auth-challenge-v1";
const authChallengeLifetimeMs = 60 * 60 * 1000;

export function createAuthChallenge({
  email,
  username = "",
  mode = "login",
  termsVersion = "",
  now = Date.now()
}) {
  return {
    email: String(email || "").trim(),
    username: String(username || "").trim(),
    mode: mode === "signup" ? "signup" : "login",
    termsVersion: String(termsVersion || ""),
    sentAt: Number(now)
  };
}

export function saveAuthChallenge(storage, challenge) {
  storage.setItem(authChallengeStorageKey, JSON.stringify(challenge));
  return challenge;
}

export function loadAuthChallenge(storage, now = Date.now()) {
  try {
    const challenge = JSON.parse(storage.getItem(authChallengeStorageKey));
    const valid = challenge
      && challenge.email
      && ["signup", "login"].includes(challenge.mode)
      && Number.isFinite(Number(challenge.sentAt))
      && Number(now) - Number(challenge.sentAt) <= authChallengeLifetimeMs;
    if (!valid) {
      clearAuthChallenge(storage);
      return null;
    }
    return createAuthChallenge({ ...challenge, now: Number(challenge.sentAt) });
  } catch {
    clearAuthChallenge(storage);
    return null;
  }
}

export function clearAuthChallenge(storage) {
  storage.removeItem(authChallengeStorageKey);
}

export function normalizeOtpCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\D/g, "");
}

export function isValidOtpCode(value) {
  return /^\d{6,10}$/.test(String(value || ""));
}
