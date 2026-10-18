'use strict';
// Static application shell ONLY. File picker images and OCR results are never cached.
const CACHE = 'screenshot-intent-private-ocr-v5';
const STATIC = [
  './', './index.html', './app.mjs', './app.mjs?v=20261018.2', './ocr.mjs', './intent.mjs',
  './image-understanding.mjs', './vision.mjs', './vision.mjs?v=20261018.2',
  './vision-worker.mjs', './vision-worker.mjs?v=20261018.2', './vendor/vision/SHA256.json',
  './manifest.webmanifest', './vendor/tesseract.min.js', './vendor/worker.min.js',
  './vendor/tesseract-core-lstm.wasm.js',
  './vendor/lang/rus.traineddata.gz', './vendor/lang/eng.traineddata.gz',
];
const OPTIONAL = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'mobilenet-v4.onnx', 'imagenet-labels.json'].map((name) => './vendor/vision/' + name);
const optionalPaths = new Set(OPTIONAL.map((relative) => new URL(relative, self.registration.scope).pathname));
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
      (!allowedPaths.has(url.pathname) && !optionalPaths.has(url.pathname))) return;
  // Fresh HTML online prevents a previously installed shell hiding a release.
  // Offline navigation (including a release query) falls back to the static root.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./', self.registration.scope))));
    return;
  }
  event.respondWith(Promise.resolve().then(() => caches.match(event.request)).catch(() => undefined).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && optionalPaths.has(url.pathname)) {
      // Storage is optional: Safari/private mode may refuse a large cached file.
      // A successful download must still reach the model when persistence fails.
      try {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      } catch { /* Continue online without offline persistence. */ }
    }
    return response;
  }));
});
