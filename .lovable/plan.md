

# Видео без скачивания + ссылки в редакторе

## 1. Видео в редакторе без скачивания

**Файл:** `src/components/course-builder/SortableLessonItem.tsx` (строка 317)

Добавить `controlsList="nodownload"` к тегу `<video>` — как уже сделано в BlockEditor и других компонентах. Видео будет проигрываться прямо в редакторе без предложения скачать.

## 2. Кнопка «Ссылка» в RichTextEditor

**Файл:** `src/components/course-builder/RichTextEditor.tsx`

- Добавить `'a'` в `ALLOWED_TAGS`, добавить `'href', 'target', 'rel'` в `ALLOWED_ATTR`
- Добавить кнопку «Ссылка» (иконка `Link2`) в floating toolbar
- При нажатии: проверить, выделен ли текст. Если да — показать `prompt()` с полем для URL. При вводе URL — вызвать `document.execCommand('createLink', false, url)`, затем найти созданный `<a>` и установить `target="_blank"` и `rel="noopener noreferrer"`
- Если текст уже обёрнут в ссылку — кнопка снимает ссылку (`document.execCommand('unlink')`)
- Пользователь сам выделяет текст, нажимает кнопку, вводит URL — текст становится кликабельной ссылкой

## Затрагиваемые файлы
- `src/components/course-builder/SortableLessonItem.tsx` — одна правка (добавить `controlsList="nodownload"`)
- `src/components/course-builder/RichTextEditor.tsx` — кнопка ссылки + разрешение тега `<a>` в санитайзере

