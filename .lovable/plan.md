

# Исправление оборачивания текста в ссылку

## Проблема

`requestAnimationFrame` недостаточно — Dialog ещё не полностью закрыт к этому моменту, и `execCommand("createLink")` молча не срабатывает, потому что фокус не успевает вернуться в `contenteditable`. Кроме того, сохранённый `Range` может стать невалидным после закрытия Dialog.

## Решение

Отказаться от ненадёжного `execCommand` и использовать прямую DOM-манипуляцию: `range.surroundContents()` для оборачивания выделенного текста, и `range.insertNode()` для вставки новой ссылки. Это не зависит от фокуса и работает надёжно.

### Изменения в `BlockEditor.tsx` (строки 1043-1074)

1. **Заменить `requestAnimationFrame` на `setTimeout(..., 150)`** — даёт Dialog время полностью закрыться
2. **Заменить `execCommand("createLink")` на прямую DOM-манипуляцию:**
   - Для выделенного текста: создать `<a>` элемент, установить `href/target/rel`, использовать `rangeClone.surroundContents(anchor)` 
   - Для вставки новой ссылки: создать `<a>` с текстом, использовать `range.insertNode(anchor)`
3. **После вставки**: диспатчить `input` event для синхронизации состояния

### Ключевой код

```typescript
setTimeout(() => {
  const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`) as HTMLElement;
  if (!blockEl) return;
  blockEl.focus();

  if (hadSelection && rangeClone) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    rangeClone.surroundContents(anchor);
  } else {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = text;
    const range = document.createRange();
    range.selectNodeContents(blockEl);
    range.collapse(false);
    range.insertNode(anchor);
  }

  blockEl.dispatchEvent(new Event('input', { bubbles: true }));
}, 150);
```

### Файлы
- `src/components/course-builder/BlockEditor.tsx` — замена execCommand на DOM-манипуляцию

