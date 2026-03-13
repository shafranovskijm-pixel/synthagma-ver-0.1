

## Проблема

Третий API-ключ GigaChat (KEY_3 / slot-2) не расходует токены, потому что **маршрутизация по слотам не работает между отдельными HTTP-запросами**.

### Причина
Каждый вызов edge-функции `gigachat` создаёт **свой экземпляр** массива `slots` (или переиспользует один изолят, где все слоты свободны к моменту нового запроса). Функция `acquireSlot()` всегда берёт **первый свободный** — это `slot-0`. Три параллельных потока из ContentGeneratorTab делают 3 отдельных HTTP-запроса, и каждый видит все слоты свободными → все идут в slot-0.

Пул слотов работает только для конкурентных запросов **внутри одного изолята**, что не гарантировано.

### Решение

Передавать `streamIndex` (1, 2, 3) в edge-функцию и использовать его для **детерминированного выбора слота** GigaChat.

#### 1. `ContentGeneratorTab.tsx`
Добавить `stream_index: streamIndex` в body каждого вызова `safeInvoke("gigachat", ...)` — для content, questions и answers.

#### 2. `gigachat/index.ts`
Читать `stream_index` из body и передавать его в `callAI()` как `taskIndex`.

#### 3. `_shared/gigachat-client.ts` — `callAI()`
Когда `preferredProvider === "gigachat"` и передан `taskIndex`, использовать `taskIndex % slots.length` для выбора конкретного слота вместо `acquireSlot()`. Это гарантирует:
- Поток 1 → slot-0 (KEY)
- Поток 2 → slot-1 (KEY_2)  
- Поток 3 → slot-2 (KEY_3)

```text
ContentGeneratorTab          gigachat/index.ts         gigachat-client.ts
─────────────────           ──────────────────        ──────────────────
Stream 1 → stream_index=1  → taskIndex=1             → slot = 1 % 3 = 1
Stream 2 → stream_index=2  → taskIndex=2             → slot = 2 % 3 = 2
Stream 3 → stream_index=3  → taskIndex=3             → slot = 3 % 3 = 0
```

| Файл | Изменение |
|---|---|
| `ContentGeneratorTab.tsx` | Добавить `stream_index` в body всех вызовов gigachat |
| `gigachat/index.ts` | Читать `stream_index`, передавать как `taskIndex` в `callAI` |
| `gigachat-client.ts` | В `callAI` при `gigachat` + `taskIndex`: использовать `useSlotDirect(taskIndex % slots.length)` вместо `callGigaChat` |

