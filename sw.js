const CACHE_NAME = "conan-card-tracker-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./guide.html",
  "./guide.css",
  "./terms.html",
  "./privacy.html",
  "./legal.css",
  "./styles.css",
  "./src/app.js",
  "./src/analytics.js",
  "./src/sync-state.js",
  "./src/onboarding.js",
  "./src/initial-state.js",
  "./src/admin-analytics.js",
  "./src/admin-view.js",
  "./src/auth-feedback.js",
  "./src/cloud.js",
  "./src/supabase-config.js?v=2",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
  );
});
