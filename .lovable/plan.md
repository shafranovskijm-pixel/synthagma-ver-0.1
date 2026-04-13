

# Исправление вставки ссылок: позиционирование и работоспособность

## Проблема

1. Popover привязан к скрытому `<span className="hidden" />` — поэтому он появляется в левом верхнем углу вместо центра
2. `createLink` / `insertHTML` не срабатывают, потому что фокус теряется при взаимодействии с Popover, и `savedLinkRange` может быть невалидным к моменту применения

## Решение

Заменить `Popover` на `Dialog` (модальное окно по центру экрана). Это решает обе проблемы:
- Окно всегда по центру
- Нет привязки к DOM-элементу

### Изменения в `BlockEditor.tsx`

1. Заменить `Popover` + `PopoverTrigger` + `PopoverContent` на `Dialog` + `DialogContent`
2. Кнопка Link2 остаётся как есть — при клике сохраняет range и открывает `setLinkDialogOpen(true)`
3. В `DialogContent`:
   - Те же поля (текст + URL)
   - Кнопка «Применить» / «Вставить ссылку»
4. При применении:
   - Закрыть Dialog
   - Использовать `requestAnimationFrame` чтобы дождаться закрытия модалки
   - Затем `blockEl.focus()`, восстановить range, выполнить `createLink` или `insertHTML`
   - Диспатчить `input` event

Ключевой момент: выполнять `execCommand` **после** закрытия Dialog через `requestAnimationFrame`, чтобы фокус гарантированно вернулся в `contenteditable`.

### Файлы
- `src/components/course-builder/BlockEditor.tsx` — замена Popover на Dialog, исправление логики применения ссылки

