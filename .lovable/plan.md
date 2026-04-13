

# Исправление вставки и кликабельности ссылок в редакторе

## Корневые причины

### 1. `createLink` не работает
Когда пользователь нажимает кнопку Link2, range сохраняется. Но затем фокус уходит в поля ввода URL внутри Popover. При нажатии «Применить» вызывается `sel.addRange(savedLinkRange)` + `document.execCommand("createLink")`, однако **execCommand работает только если contenteditable элемент в фокусе**. Сейчас фокус на Input внутри Popover — команда молча не выполняется.

### 2. `insertHTML` не работает
Та же проблема: `blockEl.focus()` вызывается, но курсор не устанавливается в нужное место — `insertHTML` вставляет в никуда.

### 3. Ссылки не кликабельны
В `contentEditable` клик по ссылке ставит курсор, а не открывает URL. Нужен обработчик кликов по `<a>` тегам.

### 4. Плавающий тулбар в RichTextEditor
Кнопка Link2 в floating toolbar вызывает `handleLink()`, который только делает unlink. Создание ссылки не работает — нужно добавить полноценную логику.

## План исправления

### Файл 1: `BlockEditor.tsx`

**A. Исправить применение ссылки (onClick кнопки «Применить»):**
- Перед `createLink`: найти contenteditable через `querySelector`, вызвать `.focus()`, затем `sel.removeAllRanges()` + `sel.addRange(savedRange)`, и только потом `execCommand("createLink")`
- Перед `insertHTML`: найти contenteditable, `.focus()`, поставить курсор в конец содержимого через `Range.selectNodeContents()` + `Range.collapse(false)`, затем `insertHTML`
- После обоих: диспатчить `input` event

**B. Сделать ссылки кликабельными:**
- В RichTextEditor (или в обёртке блока) добавить обработчик `onClick` на `<a>` теги внутри contenteditable: `window.open(href, '_blank')`

### Файл 2: `RichTextEditor.tsx`

**A. Добавить обработчик клика по ссылкам:**
- На `div[contentEditable]` добавить `onClick` handler, который проверяет `e.target` — если это `<a>` тег или его потомок, открыть ссылку в новой вкладке через `window.open`

**B. Сделать кнопку Link2 во floating toolbar функциональной:**
- При нажатии: если есть выделение, показать `prompt`-free inline форму (или использовать `insertHTML` напрямую через мини-попап)
- Альтернативно: убрать кнопку Link2 из floating toolbar, оставив функционал только в нижней панели BlockEditor (чтобы не дублировать)

## Ожидаемый результат
- Выделенный текст оборачивается в кликабельную ссылку
- Вставка новой ссылки (текст + URL) работает
- Клик по ссылке в редакторе открывает её в новой вкладке

