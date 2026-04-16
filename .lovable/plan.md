
# Кнопки скачивания PDF/Word на публичной карточке

## Что делаем

Добавляем кнопки «Скачать PDF» и «Скачать Word» на публичную страницу `/company-card/:token`. Логика экспорта та же, что в админской карточке — вызов edge-функции `generate-company-card`.

## Изменения

### `src/pages/PublicCompanyCard.tsx`
- Добавить состояние `exporting` и функцию `handleExport` (копия из `CompanyCard.tsx`)
- Добавить иконки `Download`, `FileText` в импорт
- Между заголовком «Синтагма» и секциями разместить две кнопки в стиле страницы (полупрозрачные, белый текст, teal-бордер): «PDF» и «Word»
- Кнопки вызывают `supabase.functions.invoke('generate-company-card', ...)` с теми же данными `KNOWN_DATA` + address

### Стиль кнопок
- Прозрачный фон с `border border-white/20`, hover `bg-white/10`, текст `text-white`
- Расположение: горизонтально по центру под подзаголовком
