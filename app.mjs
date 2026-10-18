import { combineUnderstanding, unknownImage } from './image-understanding.mjs';
import { analyzeImageLocally, imageFailureMessage } from './vision.mjs?v=20261018.2';
import { makeOcrResult } from './ocr.mjs';
import { reviewableSuggestedIntent, suggestIntentFromOcr } from './intent.mjs';

const $ = (id) => document.getElementById(id);
const ui = {
  photo: $('photo'), preview: $('preview'), scan: $('scan'), clear: $('clear'),
  recognized: $('recognized'), analyze: $('analyze'), status: $('status'),
  vision: $('vision'),
  results: $('results'), actions: $('actions'), actionStatus: $('action-status'),
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
let draftActionId = null;
let imageUnderstanding = null;
let visionAbort = null;
const offlineOcr = document.documentElement.dataset.offlineOcr === 'true';
ui.vision.hidden = !offlineOcr;
const offlineWorkerOptions = offlineOcr ? {
  workerPath: new URL('./vendor/worker.min.js', import.meta.url).href,
  corePath: new URL('./vendor/tesseract-core-lstm.wasm.js', import.meta.url).href,
  langPath: new URL('./vendor/lang/', import.meta.url).href,
  workerBlobURL: false,
  cacheMethod: 'none',
} : {};
if (offlineOcr && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './', updateViaCache: 'none' })
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
  if (!text.trim() && !imageUnderstanding) {
    ui.results.replaceChildren();
    setStatus('Сначала распознайте скриншот или введите текст.');
    return;
  }
  const suggestion = suggestIntentFromOcr(makeOcrResult('manual', text));
  const combined = combineUnderstanding({ category: suggestion.category, proposedIntent: reviewableSuggestedIntent(suggestion) }, imageUnderstanding);
  const proposed = combined.proposedIntent;
  ui.results.replaceChildren();
  showText(ui.results, 'h2', 'Предположение');
  showText(ui.results, 'p', 'Категория: ' + categoryNames[combined.category]);
  if (imageUnderstanding) {
    showText(ui.results, 'p', 'Изображение: ' + (imageUnderstanding.accepted ? 'похоже на «' + imageUnderstanding.label + '».' : imageUnderstanding.label + '.'));
    showText(ui.results, 'p', 'Распознаётся общий класс предмета. Бренд, точная модель, цена и ваше намерение по картинке не устанавливаются.', 'small');
  }
  if (combined.conflict) showText(ui.results, 'p', 'Текст и изображение дают разные подсказки. Проверьте их и выберите намерение самостоятельно.', 'small');
  const intentSummary = showText(ui.results, 'p', 'Намерение: ' +
    (proposed ? intentNames[proposed] + ' (предложено, не выбрано)' : 'выберите кнопкой ниже'));
  const signalNames = { none: 'нет сигналов', weak: 'слабые', moderate: 'умеренные', strong: 'выраженные' };
  showText(ui.results, 'p', 'Текстовые признаки: ' + signalNames[suggestion.signalStrength], 'small');
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
      intentSummary.textContent = 'Намерение подтверждено: ' + label;
      confirmation.replaceChildren();
      showText(confirmation, 'h3', 'Результат: намерение выбрано');
      showText(confirmation, 'p', 'Ваш выбор: ' + label + '.');
      showText(confirmation, 'p', 'Следующий шаг: ' + nextStep + '.');
      renderActionEditor(confirmation, value, nextStep);
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

function invalidateDraft() {
  ui.results.replaceChildren();
  draftActionId = null;
}
// Only explicit action fields enter IndexedDB. No image, file name, URL or OCR text.
let databasePromise;
function actionDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('screenshot-intent-actions', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('actions', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Хранилище недоступно'));
    request.onblocked = () => reject(new Error('Закройте другую вкладку приложения и повторите'));
  }).catch((error) => { databasePromise = null; throw error; });
  return databasePromise;
}
async function actionTransaction(mode, run) {
  const database = await actionDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('actions', mode);
    const store = transaction.objectStore('actions');
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = transaction.onabort = () => reject(new Error('Не удалось сохранить изменения на устройстве'));
    try { run(store, (value) => { result = value; }, transaction); }
    catch (error) { transaction.abort(); reject(error); }
  });
}
function readActions() {
  return actionTransaction('readonly', (store, done) => {
    store.getAll().onsuccess = (event) => done(event.target.result);
  });
}
async function storeAction(action) {
  await actionTransaction('readwrite', (store, done, transaction) => {
    store.count().onsuccess = (event) => {
      store.get(action.id).onsuccess = (existing) => {
        if (event.target.result >= 200 && !existing.target.result) {
          transaction.abort(); return;
        }
        store.put({ ...action, createdAt: existing.target.result?.createdAt ?? action.createdAt });
        done(true);
      };
    };
  });
}
async function changeAction(id, status) {
  await actionTransaction('readwrite', (store) => {
    store.get(id).onsuccess = (event) => {
      const record = event.target.result;
      if (!record) return;
      if (status === 'delete') store.delete(id);
      else store.put({ ...record, status, updatedAt: Date.now() });
    };
  });
}
async function renderActions() {
  try {
    const records = await readActions();
    ui.actions.replaceChildren();
    const active = records.filter((item) => item.status === 'open');
    const history = records.filter((item) => item.status !== 'open');
    ui.actionStatus.textContent = active.length ? 'Открытых действий: ' + active.length : 'Пока нет сохранённых действий.';
    for (const [title, items] of [['Мои действия', active], ['История', history]]) {
      if (!items.length) continue;
      showText(ui.actions, 'h3', title);
      for (const record of items.sort((a, b) => b.createdAt - a.createdAt)) {
        const card = document.createElement('article');
        card.className = 'action-card';
        card.dataset.actionId = record.id;
        showText(card, 'h3', record.title);
        showText(card, 'p', intentNames[record.intent] + (record.dueDate ? ' · Срок: ' + record.dueDate : ' · Без срока'), 'small');
        showText(card, 'p', { open: 'Открыто', done: 'Выполнено', cancelled: 'Отменено' }[record.status], 'small');
        const options = record.status === 'open'
          ? [['done', 'Выполнено'], ['cancelled', 'Отменить'], ['delete', 'Удалить']]
          : [['open', 'Вернуть'], ['delete', 'Удалить']];
        for (const [status, label] of options) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'secondary'; button.textContent = label;
          button.dataset.actionStatus = status;
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await changeAction(record.id, status); await renderActions(); }
            catch { ui.actionStatus.textContent = 'Не удалось изменить действие. Повторите.'; button.disabled = false; }
          });
          card.append(button);
        }
        ui.actions.append(card);
      }
    }
  } catch {
    ui.actionStatus.textContent = 'Локальное хранилище недоступно. OCR и выбор намерения работают; сохранение сейчас невозможно.';
  }
}
function renderActionEditor(parent, intent, nextStep) {
  showText(parent, 'p', 'На устройстве сохраняются только название, намерение, срок и статус. Скриншот и распознанный текст не сохраняются.', 'small');
  const titleLabel = showText(parent, 'label', 'Название действия');
  titleLabel.htmlFor = 'action-title';
  const title = document.createElement('input');
  title.id = 'action-title'; title.type = 'text'; title.maxLength = 140;
  title.value = nextStep; title.autocomplete = 'off'; title.spellcheck = false;
  parent.append(title);
  const dueLabel = showText(parent, 'label', 'Срок (необязательно)');
  dueLabel.htmlFor = 'action-due';
  const due = document.createElement('input');
  due.id = 'action-due'; due.type = 'date'; parent.append(due);
  const save = document.createElement('button');
  save.type = 'button'; save.id = 'save-action'; save.textContent = 'Сохранить действие';
  const message = document.createElement('p');
  message.id = 'save-status'; message.setAttribute('role', 'status');
  let saving = false;
  save.addEventListener('click', async () => {
    if (saving) return;
    const name = title.value.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 140) { message.textContent = 'Введите название от 1 до 140 символов.'; return; }
    if (due.value && !/^\d{4}-\d{2}-\d{2}$/.test(due.value)) {
      message.textContent = 'Проверьте срок действия.'; return;
    }
    saving = true; save.disabled = true;
    const generation = scanGeneration;
    try {
      const id = draftActionId ?? crypto.randomUUID();
      draftActionId = id;
      await storeAction({ id, intent, title: name, dueDate: due.value || null,
        status: 'open', createdAt: Date.now(), updatedAt: Date.now() });
      if (generation === scanGeneration && parent.isConnected) {
        draftActionId = id;
        message.textContent = 'Действие сохранено на этом устройстве.';
        save.textContent = 'Обновить действие';
      }
      await renderActions();
    } catch {
      message.textContent = 'Сохранение не выполнено. Проверьте доступ к хранилищу; максимум 200 действий.';
    } finally { saving = false; save.disabled = false; }
  });
  parent.append(save, message);
}
void renderActions();

function reset() {
  scanGeneration += 1;
  visionAbort?.abort();
  imageUnderstanding = null;
  if (activeWorker) void activeWorker.terminate().catch(() => {});
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  selectedFile = null;
  ui.photo.value = '';
  ui.preview.removeAttribute('src');
  ui.preview.style.display = 'none';
  ui.recognized.value = '';
  invalidateDraft();
  ui.scan.disabled = true;
  ui.vision.disabled = true;
  setStatus('Данные текущего теста очищены из интерфейса.');
}
ui.photo.addEventListener('change', () => {
  // Never show the previous screenshot's text or confirmed choice for a new file.
  visionAbort?.abort();
  imageUnderstanding = null;
  ui.vision.disabled = true;
  ui.recognized.value = '';
  invalidateDraft();
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
  ui.vision.disabled = !offlineOcr;
  setStatus('Готово. Нажмите «Распознать локально».');
});
ui.clear.addEventListener('click', reset);
ui.analyze.addEventListener('click', () => { if (!busy) renderSuggestion(ui.recognized.value); });
ui.recognized.addEventListener('input', () => {
  invalidateDraft();
  setStatus('Текст изменён. Нажмите «Предложить намерение» и подтвердите выбор заново.');
});

ui.scan.addEventListener('click', async () => {
  if (busy || !selectedFile) return;
  if (!globalThis.Tesseract?.createWorker) {
    setStatus('Движок OCR не загрузился. Проверьте доступность OCR-файлов и настройки безопасности браузера.');
    return;
  }
  busy = true;
  invalidateDraft();
  ui.recognized.value = '';
  ui.recognized.disabled = true;
  ui.analyze.disabled = true;
  ui.vision.disabled = true;
  const currentGeneration = ++scanGeneration;
  ui.scan.disabled = true;
  ui.photo.disabled = true;
  let worker;
  try {
    setStatus('Готовлю изображение…');
    await ui.preview.decode();
    if (currentGeneration !== scanGeneration) return;
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
    ui.recognized.disabled = false;
    ui.analyze.disabled = false;
    ui.vision.disabled = !selectedFile || !offlineOcr;
    ui.scan.disabled = !selectedFile;
  }
});

ui.vision.addEventListener('click', async () => {
  if (busy || !selectedFile || !offlineOcr) return;
  busy = true;
  const currentGeneration = ++scanGeneration;
  const controller = new AbortController();
  visionAbort = controller;
  invalidateDraft();
  imageUnderstanding = null;
  ui.photo.disabled = ui.scan.disabled = ui.vision.disabled = ui.analyze.disabled = ui.recognized.disabled = true;
  setStatus('Готовлю локальное распознавание изображения…');
  try {
    await ui.preview.decode();
    if (currentGeneration !== scanGeneration) return;
    const report = await analyzeImageLocally(ui.preview, {
      signal: controller.signal,
      onProgress(stage) {
        if (currentGeneration !== scanGeneration) return;
        const messages = {
          loading: 'Загружаю локальную модель изображения. Первый запуск — около 30 МБ…',
          starting: 'Запускаю модель на устройстве…',
          analyzing: 'Определяю общий класс изображения…',
        };
        setStatus(messages[stage] ?? 'Обрабатываю изображение…');
      },
    });
    if (currentGeneration !== scanGeneration) return;
    imageUnderstanding = report;
    renderSuggestion(ui.recognized.value);
    setStatus(report.accepted
      ? 'Изображение разобрано. Проверьте подсказку и выберите намерение.'
      : 'Изображение не удалось определить уверенно. Выберите намерение вручную или используйте текст.');
  } catch (error) {
    if (currentGeneration === scanGeneration) {
      imageUnderstanding = unknownImage();
      renderSuggestion(ui.recognized.value);
      setStatus('Локальное распознавание изображения недоступно. ' + imageFailureMessage(error));
    }
  } finally {
    if (visionAbort === controller) visionAbort = null;
    busy = false;
    ui.photo.disabled = ui.analyze.disabled = ui.recognized.disabled = false;
    ui.scan.disabled = !selectedFile;
    ui.vision.disabled = !selectedFile || !offlineOcr;
  }
});
