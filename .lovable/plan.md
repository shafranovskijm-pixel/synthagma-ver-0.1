
# Вставка без форматирования в редакторе курсов

## Проблема
При копировании текста из внешних источников (браузер, Word и т.д.) в редактор урока вставляется текст с исходным форматированием -- фон, цвет, шрифт. Нужно, чтобы по умолчанию вставлялся чистый текст без стилей.

## Решение
Добавить обработчик `onPaste` в компонент `RichTextEditor.tsx`, который перехватывает вставку и вставляет только plain text:

```
e.preventDefault()
const text = e.clipboardData.getData('text/plain')
document.execCommand('insertText', false, text)
```

## Технические детали

### Изменяемый файл
- `src/components/course-builder/RichTextEditor.tsx` -- добавить `onPaste` на `div[contentEditable]` (строка ~137-150), который:
  1. Вызывает `e.preventDefault()` для отмены стандартной вставки
  2. Извлекает текст через `e.clipboardData.getData('text/plain')`
  3. Вставляет его через `document.execCommand('insertText', false, text)` для сохранения позиции курсора
  4. Вызывает `handleInput` для синхронизации состояния
