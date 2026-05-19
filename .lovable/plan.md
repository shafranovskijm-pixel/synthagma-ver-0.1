
## Что упускает текущий прокси

`installProxyFetch()` патчит **только** `window.fetch` и `window.WebSocket`. Всё остальное идёт напрямую на `atxwvjxbqjgkbjlhsdch.supabase.co` и блокируется у российских провайдеров на синтагма.рф. Сейчас уже починены `<img>` логотипа/обложки (через `proxiedAssetUrl` в трёх branding-хуках), но остаётся ещё 7 категорий «дыр».

### 1. `XMLHttpRequest` — НЕ патчится вообще
Используется в критичных потоках:
- `src/hooks/useLessonMedia.ts:222` — загрузка видео уроков (с прогрессом).
- `src/hooks/useExternalStorageWithProgress.ts:84` — загрузка во внешнее хранилище (свой Supabase).

Эффект: на синтагма.рф нельзя залить видео/файл в библиотеку.

### 2. `navigator.sendBeacon` — НЕ патчится
Прямые URL на `*.supabase.co` в:
- `src/utils/errorReporter.ts:155` — отправка наших же логов ошибок (ирония: лог-канал не работает там, где он нужнее всего).
- `src/utils/testAnswerQueue.ts:82` — ответы тестов при закрытии вкладки.
- `src/hooks/useVideoProgress.ts:193` — прогресс просмотра видео.
- `src/hooks/course-learning/useCourseLearningFacade.ts:317` — финальный snapshot обучения.
- `src/hooks/useRegisterOrganization.ts:142` — отправка при регистрации.

Эффект: «молчаливая» потеря прогресса/ответов на синтагма.рф.

### 3. `<video>` / `<audio>` / `<source src>` — браузер грузит мимо fetch
- `CoursePreviewView.tsx`, `CourseLearning.tsx`, `SortableLessonItem.tsx`, `AudioBlock.tsx`, `BlockRenderer.tsx`, `StorageManager.tsx`, `VideoPreview.tsx`, `WebinarRecordingUploader.tsx`, `RecordingPreviewDialog.tsx`, `HlsVideoPlayer.tsx`, `AISettingsManager.tsx`.

Эффект: видео/аудио уроков, записи вебинаров, TTS-озвучка не воспроизводятся.

### 4. `<iframe src>` для PDF-превью
- `OrganizationStudentDetails.tsx:454`, `AdminUserDetails.tsx:385`, `CoursePreviewView.tsx:83`, `InvoiceView.tsx:102`, `DemoDashboard.tsx`, шаблоны писем.

Эффект: превью PDF/документов выдаёт пустой iframe.

### 5. `window.open(signedUrl, "_blank")` — открывает прямую ссылку
- `src/lib/storage.ts:139`, `src/utils/storageHelpers.ts:55`, `useStorageManager.ts:180`, `OrgBillingDocsTab.tsx:121`, `StudentDocumentsTab.tsx:176`, `SignedDocumentPreview.tsx:28`, `useDocumentRegistrationJournal.ts:167`.

Эффект: «Скачать договор/счёт/документ» открывает заблокированный URL — белая вкладка.

### 6. `<a href download>` для скачиваний
- `useStorageManager.ts:181` (`downloadFile`), `useStudentDetailCard.ts:328` (там сначала `fetch(url)` — тоже падает).

### 7. CSS `style={{ backgroundImage: url(...) }}`
- `src/pages/WebinarPublic.tsx:156` — обложка вебинара. (Остальные `backgroundImage` — это градиенты/паттерны, не Supabase.)

### 8. `new Image()` (PDF-рендер)
- `src/components/admin/sales/DocumentSigning.tsx:91,95` — печать и подпись для PDF. На синтагма.рф подписанные документы могут рендериться без печати.

---

## План правок

### A. Расширить `src/utils/proxyFetch.ts`

1. **Запатчить `XMLHttpRequest.prototype.open`** — переписывать URL, если в нём `SUPABASE_HOST` и активен прокси-режим (то же `rewriteUrl`).
2. **Запатчить `navigator.sendBeacon`** — обернуть так, чтобы Supabase-URL рерайтились. Уже экспортированный `proxiedAssetUrl` подходит, но лучше — единый внутренний `proxiedNetworkUrl(url)`, чтобы не зависеть от `getProxyMode()` дважды.
3. `proxiedAssetUrl` уже есть — оставляем.

После этих трёх патчей все XHR/beacon-вызовы починятся **автоматически**, код в хуках править не нужно.

### B. Универсальный rewriter в storage-обёртках

Чтобы не править 30+ мест, добавим тонкие хелперы в **одном** месте (`src/lib/storage.ts` или новый `src/utils/storageUrl.ts`):
- `getPublicAssetUrl(bucket, path)` → внутри вызывает `supabase.storage.from(bucket).getPublicUrl(path)` + `proxiedAssetUrl()`.
- `getSignedAssetUrl(bucket, path, expires)` → `createSignedUrl()` + `proxiedAssetUrl()`.

Точечно заменить вызовы `getPublicUrl`/`createSignedUrl`, чьи URL в итоге попадают в `<img>`/`<video>`/`<iframe>`/`window.open`/`<a href>`. Это:
- `src/hooks/useStorageManager.ts` (превью + скачивания).
- `src/utils/storageHelpers.ts`, `src/lib/storage.ts`.
- `src/components/student/StudentDocumentsTab.tsx`, `SignedDocumentPreview.tsx`.
- `src/pages/WebinarPublic.tsx` (cover для CSS).
- `src/components/admin/sales/DocumentSigning.tsx` (`new Image().src`).
- `src/components/admin/OrgBillingDocsTab.tsx`.
- `src/hooks/useDocumentRegistrationJournal.ts`.

Где URL уже сидит в БД целиком (например `cover_image_url` вебинара, `audioUrl` в JSON-блоках уроков) — оборачивать **на месте чтения** через `proxiedAssetUrl(...)` прямо в JSX.

### C. Проверочный чек-лист после правок

Открываем синтагма.рф (или временно `forceProxyMode(true)` на любом домене через DevTools) и убеждаемся, что работают:
1. Загрузка видео урока через CourseBuilder (XHR).
2. Воспроизведение видео/аудио урока (`<video>`/`<audio>`).
3. Открытие PDF-документа в новой вкладке (`window.open`).
4. Сохранение прогресса при закрытии вкладки (`sendBeacon` → запись появилась в БД).
5. Превью PDF-договора в iframe.
6. Обложка вебинара на публичной странице.
7. Печать/подпись в PDF подписанного документа.
8. Скачивание счёта через «Скачать» в админ-биллинге.

### D. Что НЕ трогаем (уже норм)

- Realtime — патчится через `WebSocket` (есть).
- Edge Functions через `supabase.functions.invoke` — идут через `fetch` (есть).
- REST/Auth — через `fetch` (есть).
- Внешний `external-supabase/client.ts` — использует `globalThis.fetch`, патч сработает.
- Иконки Kinescope, YouTube, шрифты — не Supabase, не блокируются.
- Service Worker (`dev-dist/sw.js`) — кеширует только same-origin.

### E. Записать в память

После реализации обновить `mem://architecture/firewall-bypass-proxy`: «прокси патчит fetch + WebSocket + XHR + sendBeacon; все Supabase-URL для img/video/audio/iframe/window.open оборачивать через `proxiedAssetUrl`».

---

## Технические детали (для разработчика)

**XHR-патч:** перехватить `XMLHttpRequest.prototype.open`, сохранить оригинал, при вызове проверить URL — если `SUPABASE_HOST` и `getProxyMode()`, заменить на `rewriteUrl(url)`. Поддержать обе сигнатуры: `open(method, url)` и `open(method, url, async, user, pass)`.

**sendBeacon-патч:** `navigator.sendBeacon = (url, data) => originalBeacon.call(navigator, proxiedAssetUrl(url), data)`. Возвращаемое значение — boolean, сохранить.

**proxiedAssetUrl на CSS-фон:** просто оборачиваем строку: `style={{ backgroundImage: \`url(${proxiedAssetUrl(cover)})\` }}`.

**Совместимость с lazy proxy mode:** на sintagma.com.ru `getProxyMode()` обычно `false` → `proxiedAssetUrl` вернёт URL как есть. Если когда-то fetch-перехватчик активирует прокси из-за сетевого блока, новые ресурсы тут же начнут идти через прокси — старые `<img>`/`<video>` останутся со старым URL до следующего рендера. Это приемлемо.

**Тесты:** написать unit-тест на `rewriteUrl` + smoke-тест на XHR-патч в jsdom (mock `XMLHttpRequest`).

**Объём:** ~80 строк в `proxyFetch.ts`, ~15 точечных правок в компонентах/хуках, миграций БД не требуется.
