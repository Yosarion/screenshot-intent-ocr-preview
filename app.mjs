import { makeOcrResult } from './ocr.mjs';
import { reviewableSuggestedIntent, suggestIntentFromOcr } from './intent.mjs';

const $ = (id) => document.getElementById(id);
const ui = {
  photo: $('photo'), preview: $('preview'), scan: $('scan'), clear: $('clear'),
  recognized: $('recognized'), analyze: $('analyze'), status: $('status'),
  results: $('results'),
};
const categoryNames = {
  restaurant: 'Ресторан', product: 'Товар', event: 'Мероприятие',
  travel: 'Поездка', article: 'Статья', task: 'Задача', unknown: 'Не определено',
};
const intentNames = {
  do: 'Сделать / запланировать', buy: 'Купить', read: 'Прочитать',
  remember: 'Запомнить', share: 'Поделиться',
};
let previewUrl = null;
let busy = false;
let selectedFile = null;
let activeWorker = null;
let scanGeneration = 0;
const offlineOcr = document.documentElement.dataset.offlineOcr === 'true';
const offlineWorkerOptions = offlineOcr ? {
  workerPath: new URL('./vendor/worker.min.js', import.meta.url).href,
  corePath: new URL('./vendor/tesseract-core-lstm.wasm.js', import.meta.url).href,
  langPath: new URL('./vendor/lang/', import.meta.url).href,
  workerBlobURL: false,
  cacheMethod: 'none',
} : {};
if (offlineOcr && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './' })
    .catch(() => { /* OCR still works online if offline caching is unavailable. */ });
}
function setStatus(message) { ui.status.textContent = message; }
function showText(parent, tag, text, className = '') {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  parent.append(item);
  return item;
}
function renderSuggestion(text) {
  const suggestion = suggestIntentFromOcr(makeOcrResult('manual', text));
  const proposed = reviewableSuggestedIntent(suggestion);
  ui.results.replaceChildren();
  showText(ui.results, 'h2', 'Предположение');
  showText(ui.results, 'p', 'Категория: ' + categoryNames[suggestion.category]);
  showText(ui.results, 'p', 'Намерение: ' +
    (proposed ? intentNames[proposed] + ' (предложено, не выбрано)' : 'не выбрано — используйте кнопки ниже'));
  showText(ui.results, 'p', 'Сила текстовых сигналов: ' + suggestion.signalStrength, 'small');
  for (const evidence of suggestion.evidence) showText(ui.results, 'span', evidence.token, 'chip');
  for (const item of suggestion.extracted.prices) showText(ui.results, 'span', 'Цена: ' + item, 'chip');
  for (const item of suggestion.extracted.dates) showText(ui.results, 'span', 'Дата: ' + item, 'chip');
  for (const item of suggestion.extracted.urls) showText(ui.results, 'span', 'Ссылка: ' + item, 'chip');
  showText(ui.results, 'p', 'Выберите, что хотите сделать с этим скриншотом:', 'small');
  const choices = document.createElement('div');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Выбор намерения');
  for (const [value, label] of Object.entries(intentNames)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      for (const option of choices.querySelectorAll('button')) {
        option.setAttribute('aria-pressed', String(option === button));
      }
      const nextStep = {
        do: 'Запланировать следующий шаг',
        buy: 'Сравнить варианты и решить, покупать ли',
        read: 'Вернуться к материалу и прочитать',
        remember: 'Сохранить для будущего решения',
        share: 'Решить, кому и как поделиться',
      }[value];
      confirmation.replaceChildren();
      showText(confirmation, 'h3', 'Результат: намерение выбрано');
      showText(confirmation, 'p', 'Ваш выбор: ' + label + '.');
      showText(confirmation, 'p', 'Следующий шаг: ' + nextStep + '.');
      showText(confirmation, 'p',
        'Выбор действует только в этой тестовой странице. В основное приложение и календарь он пока не сохраняется.', 'small');
      setStatus('Намерение выбрано: ' + label + '. Результат показан ниже.');
      confirmation.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    choices.append(button);
  }
  ui.results.append(choices);
  const confirmation = document.createElement('div');
  confirmation.id = 'confirmed-intent';
  confirmation.setAttribute('role', 'status');
  confirmation.setAttribute('aria-live', 'polite');
  ui.results.append(confirmation);
  if (proposed) {
    const hint = showText(ui.results, 'p',
      'Подсказка: «' + intentNames[proposed] + '». Это предположение, а не ваш выбор.', 'small');
    hint.className = 'small';
  }
}

function reset() {
  scanGeneration += 1;
  if (activeWorker) void activeWorker.terminate().catch(() => {});
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  selectedFile = null;
  ui.photo.value = '';
  ui.preview.removeAttribute('src');
  ui.preview.style.display = 'none';
  ui.recognized.value = '';
  ui.results.replaceChildren();
  ui.scan.disabled = true;
  setStatus('Данные текущего теста очищены из интерфейса.');
}
ui.photo.addEventListener('change', () => {
  // Never show the previous screenshot's text or confirmed choice for a new file.
  ui.recognized.value = '';
  ui.results.replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  selectedFile = null;
  previewUrl = null;
  ui.preview.removeAttribute('src');
  ui.preview.style.display = 'none';
  const file = ui.photo.files?.[0];
  if (!file) { ui.scan.disabled = true; return; }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    ui.scan.disabled = true;
    setStatus('Неверный формат или файл больше 10 МБ.');
    return;
  }
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  ui.preview.src = previewUrl;
  ui.preview.style.display = 'block';
  ui.scan.disabled = false;
  setStatus('Готово. Нажмите «Распознать локально».');
});
ui.clear.addEventListener('click', reset);
ui.analyze.addEventListener('click', () => renderSuggestion(ui.recognized.value));

ui.scan.addEventListener('click', async () => {
  if (busy || !selectedFile) return;
  if (!globalThis.Tesseract?.createWorker) {
    setStatus('Движок OCR не загрузился. Проверьте доступность OCR-файлов и настройки безопасности браузера.');
    return;
  }
  busy = true;
  const currentGeneration = ++scanGeneration;
  ui.scan.disabled = true;
  ui.photo.disabled = true;
  let worker;
  try {
    setStatus('Готовлю изображение…');
    await ui.preview.decode();
    if (ui.preview.naturalWidth > 12000 || ui.preview.naturalHeight > 12000) {
      throw new Error('Изображение слишком большое по размерам (максимум 12000 пикселей)');
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(ui.preview.naturalWidth, ui.preview.naturalHeight));
    canvas.width = Math.max(1, Math.round(ui.preview.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(ui.preview.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    ctx.drawImage(ui.preview, 0, 0, canvas.width, canvas.height);
    setStatus('Загружаются OCR-модели rus + eng. Первый запуск может занять время…');
    worker = await globalThis.Tesseract.createWorker(['rus', 'eng'], 1, {
      ...offlineWorkerOptions,
      logger(message) {
        if (currentGeneration === scanGeneration &&
            message.status === 'recognizing text' && typeof message.progress === 'number') {
          setStatus('Распознавание: ' + Math.round(message.progress * 100) + '%');
        }
      },
    });
    activeWorker = worker;
    if (currentGeneration !== scanGeneration) return;
    const response = await worker.recognize(canvas);
    if (currentGeneration !== scanGeneration) return;
    const result = makeOcrResult('browser-tesseract', response.data.text,
      response.data.confidence, ['rus', 'eng']);
    ui.recognized.value = result.text;
    renderSuggestion(result.text);
    setStatus(result.status === 'empty'
      ? 'Текст не обнаружен. Можно ввести текст вручную.'
      : 'Текст распознан. Выберите намерение под результатом анализа.');
  } catch (error) {
    if (currentGeneration === scanGeneration) {
      setStatus('Ошибка OCR: ' + (error instanceof Error ? error.message : String(error)));
    }
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    if (activeWorker === worker) activeWorker = null;
    busy = false;
    ui.photo.disabled = false;
    ui.scan.disabled = !selectedFile;
  }
});
