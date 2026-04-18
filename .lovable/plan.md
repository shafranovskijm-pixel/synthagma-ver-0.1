
## Что происходит

### Ошибка `TUS PATCH failed (409): mismatch offset`

В `src/utils/tusUpload.ts` (`tusUpload`) и в `src/hooks/useLessonMedia.ts` (`handleKinescopeUpload`) реализован TUS-аплоад с ретраями. Проблема:
- При сетевом сбое/таймауте чанк может **дойти до сервера**, но клиент получит ошибку (или прервёт по `STALL_TIMEOUT_MS`).
- При ретрае мы шлём тот же `Upload-Offset`, но у сервера он уже сдвинулся → **HTTP 409 «mismatch offset»**.
- Также 409 возникает, если пользователь открыл загрузку дважды или антивирус продублировал PATCH.

Сейчас 409 трактуется просто как «фатальная ошибка», ретраи не помогают, а в UI вылетает тост `Ошибка загрузки: TUS PATCH failed (409)…`.

**Правильное TUS-поведение**: при 409/410 нужно сделать `HEAD uploadUrl`, прочитать актуальный `Upload-Offset` сервера и **резюмировать** загрузку с этой позиции (а не повторять старый чанк).

### Видео `.ts` (MPEG-TS)

1. Браузер открывает диалог `accept="video/*"` — но `.ts` чаще всего в системе зарегистрирован как `text/x-typescript`, поэтому файл просто **не виден** в окне выбора (или выбирается, только если пользователь снимет фильтр).
2. Загружаем мы его на сервер без проблем (любое расширение), но **играть `.ts` напрямую браузер (Chrome/Firefox/Edge) не умеет** — кодек MPEG-TS они не поддерживают в `<video>`. Превью сейчас даже не считает `.ts` за видео — наш regex в `VideoPreviewInline.tsx` / `VideoPreview.tsx` ловит только `mp4|webm|ogg|mov|m4v|mkv`.
3. Корректный путь воспроизведения `.ts` в браузере — через **HLS.js** (он умеет грузить и декодировать MPEG-TS-сегменты в MSE).

## Что предлагаю сделать

### 1. Починить `409 mismatch offset` (TUS resume)

В **`src/utils/tusUpload.ts`** и в TUS-цикле **`useLessonMedia.handleKinescopeUpload`**:
- При получении ответа `409` (или `410`) **не считать это фатальной ошибкой**, а:
  1. Сделать `HEAD uploadUrl` с заголовками `Tus-Resumable: 1.0.0`, прочитать `Upload-Offset` от сервера.
  2. Установить локальный `offset = serverOffset`.
  3. Продолжить со следующего чанка. Это не считается «ретраем» (счётчик не растёт).
- Дополнительно: на старте загрузки делать одну `HEAD` (если `uploadUrl` уже сохранён в state) — позволит докачивать после обрыва.
- Защититься от **двойного запуска**: если `videoUploadProgress !== null` или `tusAbortRef.current` уже занят — игнорировать второй вызов `handleVideoUpload` / `handleKinescopeUpload` и показывать тост «Загрузка уже идёт».
- Сообщение пользователю при 409 → не «Ошибка», а тихо синхронизироваться и продолжить.

### 2. Поддержка `.ts` (и `.m2ts`, `.mts`) в загрузке

Обновить три места с `accept="video/*"`:
- `src/components/course-editor/LessonEditor.tsx`
- `src/components/course-builder/block-editor/blocks/MediaBlocks.tsx`
- `src/components/course-builder/SortableLessonItem.tsx`

Заменить на:
```
accept="video/*,.ts,.m2ts,.mts,.mpg,.mpeg,video/mp2t,video/MP2T"
```
Это заставит диалог показывать `.ts`-файлы.

В описании рядом дописать «… а также `.TS / .M2TS`».

### 3. Воспроизведение `.ts` через HLS.js

Расширить детекцию «прямого видеофайла» в:
- `src/components/course-builder/VideoPreviewInline.tsx` (`isDirectVideoFileUrl` regex → добавить `\.ts|\.m2ts|\.mts|\.mpg|\.mpeg`)
- `src/components/course-editor/VideoPreview.tsx` (тот же regex в `getEmbedFromContent`)
- `src/components/lesson-viewer/...` (плеер ученика — найти и расширить аналогично, см. `mem://features/learning/external-video-playback`)

Создать новый компонент **`src/components/video/HlsVideoPlayer.tsx`**:
- Если URL заканчивается на `.ts` / `.m2ts` / `.mts` / `.m3u8` → подключить `hls.js`, скормить ему URL и вывести в `<video>`.
- Если Safari (он умеет MPEG-TS/HLS нативно) — использовать `<video src=…>` напрямую.
- Если HLS.js не поддерживается (древний браузер) — фоллбек: показать предупреждение + кнопку «Скачать видео».
- Поддерживать `controlsList="nodownload"` (по правилу платформы).

Использовать этот плеер вместо `<video>` для всех «прямых» видеофайлов в `VideoPreviewInline` / `VideoPreview` / плеера ученика.

Пакет: `hls.js` (≈100 кБ, ставится из npm).

### 4. Подсказка для пользователя

Если файл `.ts` (или `.m2ts`) — после успешной загрузки показать инфо-тост:
> «Файл `.TS` загружен. Для надёжного воспроизведения во всех браузерах рекомендуем загружать через “Видеосервис+” — он автоматически перекодирует видео.»

Это закрывает кейс «у меня видео не играет» — пользователь сразу понимает, что лучше идти в Kinescope.

## Файлы

- `src/utils/tusUpload.ts` — обработка 409 через `HEAD` + resume.
- `src/hooks/useLessonMedia.ts` — то же для TUS-цикла Kinescope; защита от двойного запуска `handleVideoUpload` / `handleKinescopeUpload`.
- `src/components/course-editor/LessonEditor.tsx` — `accept`, подпись.
- `src/components/course-builder/block-editor/blocks/MediaBlocks.tsx` — `accept`, подпись.
- `src/components/course-builder/SortableLessonItem.tsx` — `accept`, подпись.
- `src/components/course-builder/VideoPreviewInline.tsx` — регекс + использование HLS-плеера.
- `src/components/course-editor/VideoPreview.tsx` — то же.
- Плеер ученика (найдём при имплементации, скорее всего `src/components/lesson-viewer/VideoLesson*`).
- **новый** `src/components/video/HlsVideoPlayer.tsx`.
- `package.json` — добавить `hls.js`.

## Этапы

1. Поправить `tusUpload.ts`: на 409/410 → `HEAD` → синхронизация offset → продолжение без инкремента ретраев. Лог-сообщение «resync».
2. Скопировать ту же логику в TUS-цикл `useLessonMedia.handleKinescopeUpload`.
3. Защита от двойного запуска загрузок в `useLessonMedia`.
4. Расширить `accept` в трёх формах загрузки + подписи.
5. Установить `hls.js`, создать `HlsVideoPlayer`.
6. Расширить детекцию `.ts/.m2ts/.mts` и подключить новый плеер во всех местах превью/просмотра видео.
7. Тост-подсказка про Kinescope для `.ts`-файлов.
8. End-to-end проверка:
   - Загрузить большой `.mp4` с обрывом сети — после восстановления загрузка продолжается без 409.
   - Загрузить `.ts`-файл (через серверный аплоад) — файл выбирается в диалоге, загружается, отображается через HLS-плеер.
   - Загрузить `.ts` в Kinescope — работает, конвертируется на стороне Kinescope.
