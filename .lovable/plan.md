

## Цель
Показывать в подписанном документе (и в попапе, и в скачиваемом PDF) **результат принятых правок клиента**:
- вставки и замены — зелёным выделением «вставлено»;
- удаления — просто убрать текст (без перечёркивания);
- комментарии без изменений — игнорировать в финальном тексте;
- отклонённые / нерассмотренные правки — игнорировать.

## Корень проблемы
Сейчас `documentHtml` — это **исходный** текст ревизии, в него никогда не вмерживаются принятые правки (`signature_comments` с `resolution_status = "accepted"`). Поэтому в попапе предпросмотра видно «голый» договор, а в собираемом PDF — то же самое.

## Что меняем

### 1. Новый утилит `src/lib/applyAcceptedEdits.ts`
Чистая функция:
```ts
applyAcceptedEdits(html: string, comments: AcceptedComment[]): string
```
- Берёт только комментарии с `resolution_status === "accepted"`.
- Сортирует по `position_anchor.startOffset` (по убыванию, чтобы при правках с конца не сбивались offset'ы более ранних).
- По плоскому тексту документа (через `Range` или `TreeWalker` на временном контейнере в `<template>`) находит диапазоны и применяет:
  - `replace` → оборачивает `<ins data-edit="replace" style="background:#dcfce7;color:#14532d;">replacement</ins>` (старый текст вырезается);
  - `delete` → удаляет фрагмент;
  - `insert` → вставляет `<ins>...</ins>` по `path/nodeOffset` (или по offset+quoted_text как fallback);
  - `comment` → пропускаем.
- Возвращает чистый HTML без зависимости от tailwind-классов / oklch (инлайновый зелёный фон).

### 2. Использование в попапе предпросмотра
В `ContractReviewBody.tsx` — рассчитать `mergedHtml` через `useMemo(applyAcceptedEdits(documentHtml, comments), [documentHtml, comments])` и передать его в `SignedDocumentPreview` вместо сырого `documentHtml`. То же значение использовать для `sha256Hex` при инвалидации кеша PDF (см. п.4).

В `SignedDocumentPreview.tsx` — рендерить `documentHtml` (теперь уже merged) через тот же `dangerouslySetInnerHTML`, ничего больше не меняем.

### 3. Использование в собираемом PDF
В `signedDocumentPdf.ts` ветка «есть HTML-договор» уже вызывает `appendHtmlAsPages(pdf, documentHtml, ...)`. Ему просто будем передавать **уже merged** html. Чтобы зелёная подсветка вставок отрисовалась — расширим `appendHtmlAsPages` (или text parser в `pdfStampDrawer.ts`):
- При парсинге HTML распознаём теги `<ins>` (и помечаем фрагменты как «inserted»).
- При рендере fragmentа: рисуем фон-прямоугольник `rgb(0.86, 0.99, 0.84)` (light-green) под текстом и сам текст тёмно-зелёным `rgb(0.08, 0.33, 0.18)`.
- Удаления уже физически вырезаны на этапе merge — отдельно ничего не нужно.

### 4. Инвалидация кеша подписанного PDF
Сейчас если `signed_document_path` есть — отдаём кеш. После наших изменений кеш может оказаться построен из старого html. Поэтому:
- Если число / состав принятых правок изменился (или текущая ревизия обновилась) — нужно перегенерить.
- Простой признак: в `signedDocumentPath` хранить хэш входа `signed/{signatureId}_{shortHash}.pdf`. На клиенте перед использованием кеша сверяем хэш в имени файла с текущим хэшем. Не совпало — пересобираем.
- Хэш = sha256 от `mergedHtml + JSON(sender) + JSON(recipient) + scanPath + attachedPath` (берём первые 10 символов).

### 5. PDF-вложения (когда исходник — uploaded PDF)
Для PDF-вложений править содержимое файла мы не можем (это бинарь). В этом сценарии:
- На последней странице со штампами добавляем доп. блок «Принятые правки клиента» — нумерованный список из `quoted_text → replacement`/`удалить «…»`/`вставить «…»`.
- Это уже частично нужный артефакт юридически, плюс пользователь ясно видит, что было принято.

## Файлы

- `src/lib/applyAcceptedEdits.ts` — **новый**.
- `src/lib/pdfStampDrawer.ts` — расширить `appendHtmlAsPages`: поддержка `<ins>` (зелёный фон + цвет), плюс новая функция `appendAcceptedEditsListPage(pdf, edits, font, fontBold)` для PDF-вложений.
- `src/lib/signedDocumentPdf.ts` — принимать список `acceptedEdits` (для PDF-вложений), обновить логику кеш-имени (хэш в имени файла).
- `src/components/signing/ContractReviewBody.tsx` — посчитать `mergedHtml` и `acceptedEdits`, передать в `SignedDocumentPreview`.
- `src/components/signing/SignedDocumentPreview.tsx` — принимать `acceptedEdits` и пробросить в `generateSignedPdf`. Сам `documentHtml` уже приходит merged.

## Этапы

1. Реализовать `applyAcceptedEdits` (HTML→DOM→merge→HTML), покрыть все 4 kind'а.
2. Расширить `appendHtmlAsPages` поддержкой `<ins>` (фон + цвет текста).
3. Добавить `appendAcceptedEditsListPage` для PDF-вложений.
4. Поменять имя кеш-файла на `signed/{id}_{hash10}.pdf`, при отсутствии файла с актуальным хэшем — пересобирать.
5. Прокинуть `mergedHtml` и `acceptedEdits` через `ContractReviewBody → SignedDocumentPreview → generateSignedPdf`.
6. Проверка end-to-end:
   - HTML-договор → клиент оставил 3 правки → организация одну приняла, две отклонила → подписали → в попапе и в PDF видна **только** принятая правка зелёным; исходный текст изменён согласно ей; отклонённых — нет.
   - PDF-вложение → правки приняты → в собранном PDF в конце появилась страница «Принятые правки клиента» со списком.
   - Кеш PDF: добавили новую правку и приняли → кнопка «Скачать PDF» собирает заново, а не отдаёт старый файл.

