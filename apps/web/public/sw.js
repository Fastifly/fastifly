const APP_SHELL_CACHE = "fastifly-app-shell-v1";
const APP_SHELL_URLS = ["/", "/manifest.webmanifest"];
const SENSITIVE_PATHS = [/^\/api\//, /^\/auth\//, /^\/import\//, /^\/export\//, /^\/backup\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    SENSITIVE_PATHS.some((pattern) => pattern.test(url.pathname))
  ) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
  }
});
