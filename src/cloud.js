import { supabaseConfig } from "./supabase-config.js?v=2";
import { authRedirectUrl } from "./onboarding.js";

const configStorageKey = "conan-card-tracker-supabase-config";
const tableName = "app_states";

let client = null;
let currentSession = null;
let authSubscription = null;

export function getCloudConfig() {
  const localConfig = readLocalConfig();
  return {
    url: localConfig.url || supabaseConfig.url,
    anonKey: localConfig.anonKey || supabaseConfig.anonKey
  };
}

export function isCloudConfigured() {
  const config = getCloudConfig();
  return Boolean(config.url && config.anonKey);
}

export function saveCloudConfig(url, anonKey) {
  const nextConfig = { url: url.trim(), anonKey: anonKey.trim() };
  localStorage.setItem(configStorageKey, JSON.stringify(nextConfig));
  client = null;
  currentSession = null;
  return nextConfig;
}

export async function initializeCloud(onAuthChange) {
  if (!isCloudConfigured()) return cloudSnapshot("local");
  const supabase = await getClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  currentSession = data.session;

  if (!authSubscription) {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      currentSession = session;
      onAuthChange?.(cloudSnapshot("ready"));
    });
    authSubscription = listener.subscription;
  }

  return cloudSnapshot("ready");
}

export async function signInWithEmail(email, account = {}, shouldCreateUser = true) {
  const supabase = await getClient();
  const metadata = account.username ? {
    username: account.username,
    terms_version: account.termsVersion,
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString()
  } : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authRedirectUrl(window.location.href),
      shouldCreateUser,
      data: metadata
    }
  });
  if (error) throw error;
}

export async function loadAccountContext() {
  const supabase = await getClient();
  const userId = requireUserId();
  const [profileResult, consentResult, adminResult] = await Promise.all([
    supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle(),
    supabase.from("account_consents").select("terms_version, accepted_at").eq("user_id", userId).maybeSingle(),
    supabase.from("admin_users").select("role").eq("user_id", userId).maybeSingle()
  ]);
  const error = profileResult.error || consentResult.error || adminResult.error;
  if (error) throw error;
  return {
    schemaReady: true,
    username: profileResult.data?.username || "",
    termsAccepted: Boolean(consentResult.data?.accepted_at),
    termsVersion: consentResult.data?.terms_version || "",
    role: adminResult.data?.role || ""
  };
}

export async function saveAccountSetup({ username, termsVersion }) {
  const supabase = await getClient();
  const userId = requireUserId();
  const now = new Date().toISOString();
  const [profileResult, consentResult] = await Promise.all([
    supabase.from("profiles").upsert({ user_id: userId, username, updated_at: now }, { onConflict: "user_id" }),
    supabase.from("account_consents").upsert({
      user_id: userId,
      terms_version: termsVersion,
      accepted_at: now,
      ai_training_included: true
    }, { onConflict: "user_id" })
  ]);
  const error = profileResult.error || consentResult.error;
  if (error) throw error;
  return loadAccountContext();
}

export async function updateProfileUsername(username) {
  const supabase = await getClient();
  const userId = requireUserId();
  const { error } = await supabase
    .from("profiles")
    .update({ username, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
  return username;
}

export async function loadEnvironmentCatalog() {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("environment_catalog")
    .select("id, name, sort_order")
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function loadAdminEnvironmentCatalog() {
  const supabase = await getClient();
  requireUserId();
  const { data, error } = await supabase.rpc("get_admin_environment_catalog");
  if (error) throw error;
  return data || [];
}

export async function addEnvironmentCatalogItem(name) {
  const supabase = await getClient();
  requireUserId();
  const { error } = await supabase.rpc("admin_add_environment", { environment_name: name });
  if (error) throw error;
}

export async function renameEnvironmentCatalogItem(from, to) {
  const supabase = await getClient();
  requireUserId();
  const { error } = await supabase.rpc("admin_rename_environment", {
    current_name: from,
    next_name: to
  });
  if (error) throw error;
}

export async function deleteEnvironmentCatalogItem(name) {
  const supabase = await getClient();
  requireUserId();
  const { error } = await supabase.rpc("admin_delete_environment", { environment_name: name });
  if (error) throw error;
}

export async function saveAccountRecoveryStatus({
  status,
  anonymous = {},
  ambiguousCount = 0,
  errorCode = ""
}) {
  const supabase = await getClient();
  const userId = requireUserId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("account_recovery_status").upsert({
    user_id: userId,
    status,
    anonymous_decks: Number(anonymous.decks || 0),
    anonymous_sessions: Number(anonymous.sessions || 0),
    anonymous_matches: Number(anonymous.matches || 0),
    ambiguous_count: Number(ambiguousCount || 0),
    error_code: String(errorCode || "").slice(0, 80),
    resolved_at: status === "resolved" ? now : null,
    updated_at: now
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadAdminData() {
  const supabase = await getClient();
  requireUserId();
  const [profilesResult, consentsResult, statesResult, recoveryResult] = await Promise.all([
    supabase.from("profiles").select("user_id, username, created_at, updated_at"),
    supabase.from("account_consents").select("user_id, terms_version, accepted_at, ai_training_included"),
    supabase.rpc("get_admin_app_states"),
    supabase.rpc("get_admin_recovery_statuses")
  ]);
  const recoveryMissing = recoveryResult.error && isMissingRecoverySchema(recoveryResult.error);
  const error = profilesResult.error || consentsResult.error || statesResult.error || (recoveryMissing ? null : recoveryResult.error);
  if (error) throw error;
  return {
    profiles: profilesResult.data || [],
    consents: consentsResult.data || [],
    states: statesResult.data || [],
    recoveries: recoveryMissing ? [] : recoveryResult.data || []
  };
}

export async function loadAdminUserState(userId) {
  const supabase = await getClient();
  requireUserId();
  const { data, error } = await supabase.rpc("get_admin_user_state", {
    target_user_id: userId
  });
  if (error) throw error;
  return data?.[0] || null;
}

export async function signOutCloud() {
  const supabase = await getClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentSession = null;
  return cloudSnapshot("ready");
}

export async function loadCloudState() {
  const supabase = await getClient();
  const userId = requireUserId();
  const { data, error } = await supabase
    .from(tableName)
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCloudState(appState, options = {}) {
  const supabase = await getClient();
  const userId = requireUserId();
  const { expectedUpdatedAt = null, force = false } = options;
  const payload = {
    user_id: userId,
    data: appState,
    updated_at: new Date().toISOString()
  };

  if (force) {
    const { error } = await supabase.from(tableName).upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
    return payload.updated_at;
  }

  if (!expectedUpdatedAt) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select("updated_at")
      .maybeSingle();
    if (error?.code === "23505") throw cloudConflictError();
    if (error) throw error;
    return data?.updated_at || payload.updated_at;
  }

  const { data, error } = await supabase
    .from(tableName)
    .update(payload)
    .eq("user_id", userId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw cloudConflictError();
  return data.updated_at || payload.updated_at;
}

export function cloudSnapshot(mode = "ready") {
  return {
    mode,
    configured: isCloudConfigured(),
    signedIn: Boolean(currentSession?.user),
    email: currentSession?.user?.email || "",
    userId: currentSession?.user?.id || ""
  };
}

async function getClient() {
  if (client) return client;
  const config = getCloudConfig();
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase URLとAnon keyを設定してください");
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  client = createClient(config.url, config.anonKey);
  return client;
}

function readLocalConfig() {
  try {
    return JSON.parse(localStorage.getItem(configStorageKey)) || {};
  } catch {
    return {};
  }
}

function requireUserId() {
  const userId = currentSession?.user?.id;
  if (!userId) throw new Error("ログインしてください");
  return userId;
}

function cloudConflictError() {
  const error = new Error("別の端末で新しいデータが保存されています");
  error.code = "CLOUD_CONFLICT";
  return error;
}

function isMissingRecoverySchema(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST202"
    || error?.code === "42P01"
    || message.includes("get_admin_recovery_statuses")
    || message.includes("account_recovery_status");
}
