
## Проблемы (с скриншота)

1. **DOCX не рендерится**: ошибка `Can't find end of central directory: is this a zip file?` — `mammoth.browser` получил не тот ArrayBuffer. Скорее всего `fetch(file_url)` вернул HTML-страницу логина Supabase Storage (файл в приватном бакете) или редирект, а не сам .docx. Нужно: брать файл через `supabase.storage.from(bucket).createSignedUrl(...)` или `download(...)`, а не публичный URL.
2. **Просмотр должен быть встроенным**, а не модалкой. Раскрывается прямо в "Биллинг → Договоры".
3. **Клик по уведомлению** должен вести в Биллинг → конкретный договор и сразу его раскрывать (а не открывать модалку).

## Решение

### A. Встроенный просмотр в админ-биллинге
Заменить `ContractReviewDialog` на инлайн-блок `ContractReviewInline`, который раскрывается в строке договора (accordion-style). При клике на иконку "глаз" (или строку) — карточка ниже расширяется, показывая документ + панель действий + комментарии. Повторный клик — сворачивает.

- Состояние `expandedContractId` в `AdminBillingOverview`.
- Удалить `(window as any).__openContractReview` хак.
- Сам компонент `ContractReviewInline.tsx` — переиспользует логику `ContractReviewDialog` (рендер PDF/DOCX/HTML, комментарии, действия), только без `<Dialog>`-обёртки. Вынести общую часть в `ContractReviewBody.tsx`.

### B. Фикс DOCX-рендера
В `DocxRenderer.tsx`:
- Если `file_url` указывает на Supabase Storage — извлекать `bucket` и `path` и грузить через `supabase.storage.from(bucket).download(path)` → `Blob.arrayBuffer()`.
- Fallback: обычный `fetch` с проверкой `Content-Type` (если HTML — ошибка "Файл недоступен / приватный бакет").
- Логировать первые байты ArrayBuffer (PK\x03\x04 = валидный zip/docx).

Проверить, в какой бакет загружаются внешние договоры (предположительно `signature-files` или `billing-documents`) — посмотрю в `ExternalContractUploader.tsx`. Если бакет приватный — переключить на signed URL при создании revision (или хранить относительный путь и каждый раз генерировать signed URL на чтение).

### C. Клик по уведомлению → инлайн-раскрытие
В `AdminDashboard.tsx`:
- При клике на signature-уведомление: переключить `activeTab = "billing"` + установить `pendingExpandContractId = n.related_entity_id`.
- Прокинуть `pendingExpandContractId` пропом в `AdminBillingOverview` → при изменении автоматически выставлять `expandedContractId`, скроллить к строке.
- Убрать всю логику открытия модалки и `__openContractReview`.

### D. Read-only встроенный просмотр в кабинете организации
В `CounterpartiesSection.tsx` тоже инлайн-раскрытие (тот же `ContractReviewBody` в read-only режиме), убрать модалку.

## Файлы

- **Новый** `src/components/signing/ContractReviewBody.tsx` — общее тело (документ + комментарии + действия), без обёртки.
- **Удалить/упростить** `src/components/signing/ContractReviewDialog.tsx` — больше не нужен либо превращается в тонкую обёртку для legacy.
- `src/components/signing/DocxRenderer.tsx` — поддержка Supabase Storage download + проверка валидности zip.
- `src/components/admin/AdminBillingOverview.tsx` — инлайн-аккордеон + приём `pendingExpandContractId`.
- `src/pages/AdminDashboard.tsx` — `pendingExpandContractId` state, прокидка в биллинг, удаление `__openContractReview`.
- `src/components/organization/tabs/documents/CounterpartiesSection.tsx` — инлайн-раскрытие.

## Этапы
1. Создать `ContractReviewBody`, перенести в него логику из Dialog.
2. Фикс `DocxRenderer` (Supabase Storage download + диагностика).
3. Инлайн-режим в `AdminBillingOverview` + проп `pendingExpandContractId`.
4. Перенаправление из колокола в `AdminDashboard`.
5. Инлайн-режим в `CounterpartiesSection`.
6. End-to-end проверка: загрузить DOCX и PDF договор, открыть из колокола, оставить комментарий, запросить правки.
