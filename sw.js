'use strict';
// Static application shell ONLY. File picker images and OCR results are never cached.
const CACHE = 'screenshot-intent-private-ocr-v2';
const STATIC = [
  './', './index.html', './app.mjs', './ocr.mjs', './intent.mjs',
  './manifest.webmanifest', './vendor/tesseract.min.js', './vendor/worker.min.js',
  './vendor/tesseract-core-lstm.wasm.js',
  './vendor/lang/rus.traineddata.gz', './vendor/lang/eng.traineddata.gz',
];
const allowedPaths = new Set(STATIC.map((relative) => new URL(relative, self.registration.scope).pathname));
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('screenshot-intent-private-ocr-') && key !== CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !allowedPaths.has(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
