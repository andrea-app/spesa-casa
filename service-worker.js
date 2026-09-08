// Service worker minimale: mette in cache l'app shell per l'uso offline e
// l'installazione come PWA. I dati (Firestore) NON passano da qui — restano
// gestiti dall'SDK Firebase con la sua cache offline (vedi js/firebase-init.js).

const CACHE_NAME = "spesa-casa-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/data.js",
  "./js/firebase-init.js",
  "./js/firebase-config.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategia: network-first per l'HTML/JS (per prendere aggiornamenti subito),
// cache-first per il resto. Fallback alla cache se offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.url.includes("firestore.googleapis.com") || req.url.includes("googleapis.com/identitytoolkit")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
