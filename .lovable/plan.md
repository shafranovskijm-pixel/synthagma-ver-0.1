
## Проблема

На скрине видно: при скролле вниз правая панель «Добавить урок» закреплена, но **верхние карточки (Текст, Изображение, Видео) обрезаются сверху** — выходят за viewport. То же самое с левым меню уроков: верхние пункты (1-3) уезжают вверх.

## Причина

В `CourseBuilderLessonsNav.tsx` и в правой панели `CourseBuilder.tsx` используется `max-h-[calc(100vh-2rem)]` без `overflow-y-auto` на самом sticky-контейнере (или со ScrollArea, который не видит высоту правильно). Когда содержимое панели **выше viewport** (а в правой панели 10+ карточек инструментов, в левой — 10+ уроков), sticky-элемент имеет высоту больше окна → его верх уходит за `top-0`, и `top-4` его уже не удерживает (sticky прилипает к ВЕРХУ только когда элемент целиком помещается).

Решение: сделать sticky-контейнер **сам прокручиваемым** по вертикали с `max-height = 100vh - top - bottom-gap` и `overflow-y-auto`. Тогда содержимое скроллится внутри, а сама панель остаётся в зоне viewport.

## Что меняем

### 1. `src/components/course-builder/CourseBuilderLessonsNav.tsx`
- На внешнем `<aside>` уже стоит `max-h-[calc(100vh-2rem)]` — это ок.
- Внутри `NavList` уже есть `ScrollArea flex-1 min-h-0` — но `ScrollArea` от Radix требует, чтобы родитель имел **явную ограниченную высоту**. Сейчас `<aside>` это даёт. Проверить: `aside` должен быть `flex flex-col` (сейчас просто `flex`) — без `flex-col` `ScrollArea` не получит высоту.
- **Фикс:** добавить `flex-col` к `aside`.

### 2. `src/pages/CourseBuilder.tsx` — правая панель «Добавить урок»
- Сейчас sticky-контейнер не имеет внутреннего scroll. Нужно:
  - `sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto` на корневом блоке правой панели в embedded-режиме.
  - В standalone — `top-24 max-h-[calc(100vh-7rem)] overflow-y-auto`.

### 3. Проверка
Прочитать актуальные `CourseBuilder.tsx` и `CourseBuilderLessonsNav.tsx`, чтобы точно расставить правки на нужных строках, и убедиться, что нет конфликтующих `overflow-hidden` на sticky-контейнерах.

## Файлы

- `src/pages/CourseBuilder.tsx` — добавить `overflow-y-auto` на sticky-обёртку правой панели + корректный `max-height`.
- `src/components/course-builder/CourseBuilderLessonsNav.tsx` — добавить `flex-col` на `<aside>`, чтобы внутренний `ScrollArea` получил высоту.

## Этапы

1. Прочитать текущие версии обоих файлов.
2. Добавить `flex-col` в `<aside>` навигации уроков.
3. На правой sticky-панели в `CourseBuilder.tsx` поставить `overflow-y-auto` + `max-h-[calc(100vh-2rem)]` (embedded) / `max-h-[calc(100vh-7rem)]` (standalone).
4. End-to-end проверка:
   - Скролл вниз → верхние карточки правой панели НЕ обрезаны, доступны через внутренний scroll;
   - Верхние уроки в левом меню НЕ обрезаны, доступны через внутренний scroll;
   - Обе панели остаются на экране целиком.
