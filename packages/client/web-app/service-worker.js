/* Hall service worker. It answers only screen openings under its scope and keeps only the offline page. */
const CACHE_NAME = "__HALL_CACHE_NAME__";
const SCOPE = new URL(self.registration.scope);
const OFFLINE_URL = new URL("offline.html", SCOPE).href;

function opensScreen(request) {
  if (request.mode !== "navigate" || request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (!opensScreen(event.request)) return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL)).then((response) => response ?? Response.error()),
    ),
  );
});
