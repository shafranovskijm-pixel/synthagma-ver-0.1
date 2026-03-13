

## План: Round-robin распределение по 3 ключам SaluteSpeech

### Проблема

Сейчас `pickSlot()` в `salutespeech-tts/index.ts` использует `Math.random()` — это не гарантирует равномерное распределение. Нужен детерминированный round-robin, чтобы токены списывались поровну с каждого из 3 ключей.

### Изменение

**Файл: `supabase/functions/salutespeech-tts/index.ts`**

Заменить `Math.random()` на счётчик round-robin:

```typescript
// Было (строки 144-151):
const slots = buildSlots();
function pickSlot(): TokenSlot | null {
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  const idx = Math.floor(Math.random() * slots.length);
  return slots[idx];
}

// Станет:
const slots = buildSlots();
let roundRobinCounter = 0;
function pickSlot(streamIndex?: number): TokenSlot | null {
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  if (typeof streamIndex === 'number') return slots[streamIndex % slots.length];
  const idx = roundRobinCounter % slots.length;
  roundRobinCounter++;
  return slots[idx];
}
```

Также в `serve()` (строка 236) — принять опциональный `stream_index` из тела запроса и передать в `pickSlot()`:

```typescript
const { text, voice = "natalya", format = "opus", stream_index } = await req.json();
// ...
const primarySlot = pickSlot(stream_index)!;
```

Это обеспечит: запрос 1 → слот 0, запрос 2 → слот 1, запрос 3 → слот 2, запрос 4 → слот 0, и т.д. Если клиент передаёт `stream_index` — используется он напрямую.

Никаких клиентских изменений не требуется — round-robin работает на стороне сервера автоматически. Но при параллельных вызовах (например, из конвейера) клиент может передать `stream_index` для детерминированной маршрутизации.

