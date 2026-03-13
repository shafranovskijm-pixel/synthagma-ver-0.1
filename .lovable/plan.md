

## Проблема

В `gigachat-client.ts` функция `callAIRoundRobin` (строки 571-587) добавляет в массив каналов только **slot-0** и **slot-1**, но **никогда не добавляет slot-2** (третий ключ). Проверка `if (slots.length > 1)` ловит только второй слот. Нет проверки `if (slots.length > 2)` для третьего.

Итого: 3 ключа GigaChat настроены, 3 слота создаются в пуле, но в round-robin участвуют только 2 из них. Третий ключ простаивает.

## Решение

**1. `supabase/functions/_shared/gigachat-client.ts`** — добавить slot-2 в каналы round-robin:

После блока `if (slots.length > 1)` (строка 579) добавить аналогичный блок:

```typescript
if (slots.length > 2) {
  channels.push({
    name: `GigaChat slot-2 (${gcModel})`,
    call: async (msgs, mt) => {
      const text = await useSlotDirect(2, msgs, gcModel, mt);
      return { text, model: `${gcModel} (slot-2)` };
    },
  });
}
```

Это даст 4 канала в round-robin: Lovable AI → slot-0 → slot-1 → slot-2. Каждая задача по `taskIndex % 4` получает свой канал, все 3 ключа GigaChat работают параллельно.

### Файл

| Файл | Что |
|---|---|
| `supabase/functions/_shared/gigachat-client.ts` | Добавить slot-2 в каналы round-robin |

