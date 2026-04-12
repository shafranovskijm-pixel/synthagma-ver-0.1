

# Убрать LazyMediaPreview из предпросмотра курса (студенческий вид)

## Проблема

`LazyMediaPreview` была добавлена для предотвращения скачивания в **редакторе**, но она также попала в `RenderBlock` — компонент, который используется в `BlockRenderer` для **студенческого предпросмотра** (`/course-preview/`). В результате студенты видят кнопки «Показать видео» вместо самого контента.

## Решение

Убрать `LazyMediaPreview` из `RenderBlock` (read-only renderer), оставив её только в редакторских компонентах. В предпросмотре медиа должно загружаться сразу, как было раньше.

## Изменения

### `src/components/course-builder/BlockEditor.tsx` — функция `RenderBlock` (строки ~2382–2455)

Убрать обёртки `LazyMediaPreview` в следующих местах:

1. **Document block** (строка 2398): убрать `<LazyMediaPreview type="document">`, оставить только iframe внутри
2. **Video block — DirectVideoBlock** (строки 2432, 2450): `DirectVideoBlock` сам уже содержит `LazyMediaPreview` внутри — нужно также сделать так, чтобы в read-only контексте он показывал видео сразу. Варианты:
   - Либо создать отдельный `DirectVideoBlockReadonly` без lazy
   - Либо добавить проп `lazy={false}` в `DirectVideoBlock`
3. **YouTube** (строка 2437): убрать `<LazyMediaPreview type="iframe">`, оставить iframe напрямую
4. **Vimeo** (строка 2440): аналогично
5. **Rutube** (строка 2443): аналогично
6. **Iframe embed** (строка 2446): аналогично

### `src/components/course-builder/BlockEditor.tsx` — компонент `DirectVideoBlock` (строка 242)

Добавить опциональный проп `lazy?: boolean` (по умолчанию `true`). Если `lazy === false`, рендерить `DirectVideoBlockInner` сразу без обёртки `LazyMediaPreview`.

В `RenderBlock` передавать `<DirectVideoBlock url={vid} lazy={false} />`.

### Итого

- `LazyMediaPreview` остаётся в **редакторских** блоках (верхняя часть файла — формы редактирования)
- `RenderBlock` (студенческий просмотр) показывает медиа сразу, без кнопок

## Затрагиваемые файлы
- `src/components/course-builder/BlockEditor.tsx`

