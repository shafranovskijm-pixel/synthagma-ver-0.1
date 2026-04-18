

## Корень проблем

Глядя на скриншот, договор это **PDF-вложение** (`current_revision.file_url` = .pdf в storage), а не HTML. Текущий `generateSignedPdf`:

1. **Не вставляет тело PDF-договора в итоговую сборку** — только заглушку «Документ-вложение». Поэтому «договор не содержит правок» — там вообще нет контента договора.
2. **Падает на html2canvas**, потому что:
   - prose/contract HTML может содержать современные CSS (`oklch()`, css-переменные дизайн-системы) — html2canvas их не парсит и кидает ошибку.
   - тянет внешние изображения через signed URL без надёжного CORS.
3. **Кириллица** в jsPDF без подключённого шрифта рендерится квадратами / пустыми глифами.
4. RLS на `external-contracts` для пути `signed/` мог не разрешать `upsert` от обычного юзера.

## Что меняем

### A. Полностью переписываем `src/lib/signedDocumentPdf.ts` — два движка под два сценария:

**Сценарий 1: PDF-вложение (`attachedFileUrl` это .pdf)**
- Скачиваем оригинальный PDF как `ArrayBuffer`.
- Через **`pdf-lib`** (`PDFDocument.load(...)`) открываем его.
- Через `pdf-lib` рисуем поверх последней страницы или **добавляем в конец отдельные страницы**:
  - заголовок «Подписи сторон»,
  - таблицу-штамп Отправителя (ИП Шафрановский, email, дата МСК, IP, agreementId, SHA-256),
  - таблицу-штамп Получателя,
  - футер «63-ФЗ».
- Для скан-листа (если `signature_method=handwritten_scan`) — встраиваем картинку/PDF тоже через pdf-lib (`embedJpg/embedPng/copyPages`).
- Без html2canvas вообще → не падает на oklch.
- Кириллица: используем встраиваемый TTF (PT Sans/Roboto) через `@pdf-lib/fontkit` (`pdf.registerFontkit`, затем `pdf.embedFont(ttfBytes)`). Шрифт кладём в `public/fonts/` (`PTSans-Regular.ttf`, `PTSans-Bold.ttf`).

**Сценарий 2: HTML-договор (`documentHtml`)**
- То же, но первую часть PDF создаём заново: рендерим текст HTML → plain blocks (parser упрощает: `<p>`, `<h1-3>`, `<ul>`, `<table>` → текст с переносами) и пишем через pdf-lib теми же шрифтами PT Sans.
- Альтернатива при нехватке времени: всё ещё используем html2canvas, но **только** на чистом инлайн-стилизованном контейнере (без классов tailwind/oklch). Текущий код контейнер уже инлайн-стилизует, проблема — встроенный `documentHtml` от ReviewableDocument с oklch-классами; перед рендером прогоняем через очистку: вырезаем `class`, `style` с `oklch`/`hsl(var(...`, заменяем на безопасные.

→ Берём **первый вариант** (pdf-lib). Надёжно, без visual-зависимости от tailwind.

### B. Хранилище и RLS
- Добавим миграцию: явные политики на `external-contracts` для папки `signed/`:
  - `INSERT/UPDATE` разрешён auth-юзеру, если он либо отправитель (`organization_id` = его текущая org), либо получатель по токену (через RPC).
  - `SELECT` — те же. Сам файл всегда открываем через `createSignedUrl`, поэтому публичность не нужна.

### C. UI `SignedDocumentPreview.tsx`
- Убрать ветку «Сформировать PDF / Скачать PDF» с двумя состояниями кеша, оставить **одну кнопку** «Скачать PDF»: если `signedDocumentPath` есть и файл актуален — открываем; иначе генерим и сохраняем.
- Добавить **инвалидаци кеша** при смене ревизии: если `current_revision_id` изменился после `signed_document_path` — пересобираем.

### D. Шрифты
- `public/fonts/PTSans-Regular.ttf`, `public/fonts/PTSans-Bold.ttf` (свободная Apache 2.0 лицензия, ~250KB каждый). Грузим лениво только при сборке PDF (`fetch('/fonts/...')`).

## Файлы

- `src/lib/signedDocumentPdf.ts` — переписать на pdf-lib.
- `src/lib/pdfStampDrawer.ts` — новый: функции `drawStampPage(pdf, sender, recipient, opts)`, `drawHtmlAsPages(pdf, html, font, fontBold)`.
- `src/components/signing/SignedDocumentPreview.tsx` — упростить логику кнопки.
- `public/fonts/PTSans-Regular.ttf`, `public/fonts/PTSans-Bold.ttf` — добавить.
- `package.json` — добавить `pdf-lib`, `@pdf-lib/fontkit`. Удалить использование `html2canvas` в этом флоу (пакет оставить — он используется в других местах).
- Миграция `signed_storage_policies.sql` — RLS на путь `signed/*` в бакете `external-contracts`.

## Этапы

1. Установить `pdf-lib` и `@pdf-lib/fontkit`, положить TTF-шрифты в `public/fonts/`.
2. Реализовать `pdfStampDrawer.ts` (рисование штампа сторон через pdf-lib + кириллица).
3. Реализовать `signedDocumentPdf.ts`:
   - ветка «есть PDF-вложение» → load + appendPages со штампами (+ embed скана).
   - ветка «HTML» → создать новый PDFDocument, отрендерить текст блоками + штампы.
4. Миграция RLS на storage `external-contracts` для пути `signed/`.
5. Обновить `SignedDocumentPreview.tsx` (одна кнопка, инвалидация по `current_revision_id`).
6. Проверить флоу: открыть подписанный договор-PDF → «Скачать PDF» → в файле виден исходный договор + последняя страница со штампами обеих сторон + кириллица читается. Повторно — кеш-файл открывается мгновенно. Аналогично для HTML-договора и для варианта «загруженный скан».

