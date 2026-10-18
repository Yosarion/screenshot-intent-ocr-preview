import * as ort from './vendor/vision/ort.wasm.min.mjs';
import { summarizeImageLogits } from './image-understanding.mjs';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('./vendor/vision/', import.meta.url).href;
ort.env.logLevel = 'error';

async function verifiedAsset(name, manifest) {
  const entry = manifest.files.find((item) => item.path === name);
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid model manifest');
  const url = new URL('./vendor/vision/' + name, import.meta.url);
  const response = await fetch(url, { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error('Model unavailable');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== entry.sha256 || bytes.byteLength !== entry.bytes) {
    if ('caches' in globalThis) for (const key of await caches.keys()) {
      if (key.startsWith('screenshot-intent-')) await (await caches.open(key)).delete(url);
    }
    throw new Error('Model integrity failed');
  }
  return bytes;
}
self.onmessage = async (event) => {
  let session;
  try {
    const input = event.data?.input;
    if (!(input instanceof ArrayBuffer) || input.byteLength !== 224 * 224 * 3 * 4) throw new Error('Invalid image dimensions');
    const tensor = new Float32Array(input);
    if (!tensor.every(Number.isFinite)) throw new Error('Invalid image data');
    self.postMessage({ type: 'progress', stage: 'loading' });
    const response = await fetch(new URL('./vendor/vision/SHA256.json', import.meta.url), { credentials: 'omit' });
    if (!response.ok) throw new Error('Model manifest unavailable');
    const manifest = await response.json();
    const model = await verifiedAsset('mobilenet-v4.onnx', manifest);
    const labelBytes = await verifiedAsset('imagenet-labels.json', manifest);
    const labels = JSON.parse(new TextDecoder().decode(labelBytes));
    self.postMessage({ type: 'progress', stage: 'starting' });
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    self.postMessage({ type: 'progress', stage: 'analyzing' });
    const result = await session.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, 224, 224]) });
    const report = summarizeImageLogits(result.logits.data, labels);
    await session.release(); session = null;
    // Only coarse object information returns to the UI, never raw image bytes.
    self.postMessage({ type: 'result', report });
  } catch {
    self.postMessage({ type: 'error' });
  } finally {
    if (session) await session.release().catch(() => {});
    self.close();
  }
};
