import { supabaseConfig } from "./supabase-config.js";

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

export async function signInWithEmail(email) {
  const supabase = await getClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split("#")[0]
    }
  });
  if (error) throw error;
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
