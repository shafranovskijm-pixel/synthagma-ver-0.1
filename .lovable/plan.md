

# Исправление загрузки видео — кнопка «Выбрать файл» не реагирует

## Проблема

При нажатии «Выбрать файл» в видеоуроке (embedded-режим редактора на странице курса) ничего не происходит — файловый диалог не открывается.

## Анализ

Текущая реализация использует паттерн `<label>` + скрытый `<input type="file">`. Этот паттерн может не срабатывать в некоторых случаях:
- Внутри `Suspense` + lazy-loaded компонентов ref на input может сброситься
- `useSortable` (DnD) может перехватывать pointer-events на уровне карточки
- `overflow-hidden` на карточке (строка 141) может влиять на фокус input

## Решение

Заменить паттерн `<label>` → `<Button onClick>` + `inputRef.click()` для обоих вариантов загрузки (Kinescope и сервер). Это более надёжный способ, не зависящий от CSS-контекста и DnD-обработчиков.

### `src/components/course-builder/SortableLessonItem.tsx`

**Kinescope upload (строки 315-318):**
- Заменить `<label>` с вложенным `<input>` на `<Button onClick={() => media.kinescopeInputRef.current?.click()}>` + отдельный `<input>` вне label

**Server upload (строки 325-328):**
- Аналогично — `<Button onClick={() => media.videoInputRef.current?.click()}>` + отдельный `<input>`

Также добавить `console.log` в onChange хэндлеры для диагностики (на случай повторения).

## Файлы

| Файл | Действие |
|---|---|
| `src/components/course-builder/SortableLessonItem.tsx` | Заменить `<label>` на `<Button>` + programmatic `click()` для file inputs (~6 строк) |

