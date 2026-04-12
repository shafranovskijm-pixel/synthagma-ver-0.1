

# Убрать автоскачивание файлов при открытии конструктора курсов

## Проблема

При открытии конструктора курсов Chrome показывает запрос «скачивание нескольких файлов». Причина — атрибут `preload="auto"` на элементах `<audio>`, который заставляет браузер сразу загружать файлы. Если хранилище отдаёт заголовок `Content-Disposition: attachment`, Chrome интерпретирует это как скачивание.

## Решение

Заменить `preload="auto"` на `preload="none"` во всех аудио-элементах в конструкторе курсов (а также добавить `preload="none"` к видео-элементам, где его нет). Это не повлияет на воспроизведение — файл загрузится при нажатии кнопки Play.

## Изменения

### 1. `src/components/course-builder/SortableLessonItem.tsx` (строка 347)
- `preload="auto"` → `preload="none"` в элементе `<audio>` для аудио-уроков
- Добавить `preload="none"` к `<video>` на строке 315

### 2. `src/components/course-builder/BlockEditor.tsx` (строки 1515, 2521)
- `preload="auto"` → `preload="none"` в обоих элементах `<audio>` (редактор аудиоблоков и предпросмотр)

## Затрагиваемые файлы
- `src/components/course-builder/SortableLessonItem.tsx`
- `src/components/course-builder/BlockEditor.tsx`

