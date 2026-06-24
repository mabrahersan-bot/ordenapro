const CACHE_NAME = "dindu-v24";
const APP_SHELL = [
  "./",
  "./instalar.html",
  "./manifest.webmanifest",
  "./manifest-buyer.webmanifest",
  "./manifest-merchant.webmanifest",
  "./manifest-courier.webmanifest",
  "./manifest-admin.webmanifest",
  "./apps/index.html",
  "./styles.css",
  "./apps/app.css",
  "./apps/config.js",
  "./apps/shared.js",
  "./apps/pwa.js",
  "./apps/buyer/index.html",
  "./apps/buyer/buyer.js",
  "./apps/merchant/index.html",
  "./apps/merchant/merchant.js",
  "./apps/courier/index.html",
  "./apps/courier/courier.js",
  "./apps/admin/index.html",
  "./apps/admin/admin.js",
  "./assets/icon.svg",
  "./assets/dindu-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./apps/index.html"));
});
