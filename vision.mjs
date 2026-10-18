import { unknownImage } from './image-understanding.mjs';

// Resize and normalize only in memory; nothing is saved or sent to a server.
export function prepareVisionInput(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width > 12000 || height > 12000) throw new Error('Invalid image size');
  const side = Math.min(width, height) * 224 / 256;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 224, 224);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 224, 224);
  const rgba = context.getImageData(0, 0, 224, 224).data;
  const pixels = 224 * 224, input = new Float32Array(pixels * 3);
  const means = [0.485, 0.456, 0.406], deviations = [0.229, 0.224, 0.225];
  let sum = 0, squared = 0;
  for (let i = 0; i < pixels; i++) {
    const luminance = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / (3 * 255);
    sum += luminance; squared += luminance * luminance;
    for (let channel = 0; channel < 3; channel++) {
      input[channel * pixels + i] = (rgba[i * 4 + channel] / 255 - means[channel]) / deviations[channel];
    }
  }
  canvas.width = canvas.height = 1;
  return { input, variance: squared / pixels - (sum / pixels) ** 2 };
}

export function analyzeImageLocally(image, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  const prepared = prepareVisionInput(image);
  if (prepared.variance < 0.0001) return Promise.resolve(unknownImage());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./vision-worker.mjs', import.meta.url), { type: 'module' });
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Local image analysis timed out')), 120000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.stage);
      else if (data.type === 'result') finish(null, data.report);
      else if (data.type === 'error') finish(new Error('Local image analysis failed'));
    };
    worker.onerror = (event) => { event.preventDefault(); finish(new Error('Local model could not start')); };
    worker.postMessage({ input: prepared.input.buffer }, [prepared.input.buffer]);
  });
}
