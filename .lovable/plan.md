

## Проблема: Round-Robin не работает между запросами

### Диагностика
Отправлены 2 тестовых запроса к `salutespeech-tts`:
- Запрос 1: `voice=natalya` → **slot 0** ✅ (200, 7.5 КБ аудио)
- Запрос 2: `voice=boris` → **slot 0** ✅ (200, 9.5 КБ аудио)

Оба ушли через slot 0. Логи:
```
[SaluteSpeech] voice=natalya -> Nec_24000, slots=2
[SaluteSpeech] Token refreshed for slot 0
[SaluteSpeech] Synthesis OK via slot 0

[SaluteSpeech] voice=boris -> Bys_24000, slots=2
[SaluteSpeech] Token refreshed for slot 0
[SaluteSpeech] Synthesis OK via slot 0
```

### Причина
Edge-функции — **stateless**. Переменная `roundRobinIndex` инициализируется в `0` при каждом холодном старте. Поэтому round-robin работает только для параллельных запросов **внутри одного invocation** (чего не бывает).

**Fallback работает**: если slot 0 упадёт, система попробует slot 1. Но распределение нагрузки — нет.

### Что работает
- ✅ Оба ключа настроены (`SALUTESPEECH_AUTH_KEY` и `SALUTESPEECH_AUTH_KEY_2` = true)
- ✅ Оба запроса возвращают аудио (slot 0 точно работает)
- ✅ Failover-логика (при ошибке slot 0 → пробуем slot 1)
- ❌ Реальное распределение нагрузки между слотами

### Решение
Заменить `roundRobinIndex` на **случайный выбор слота** (`Math.random()`). Это даст ~50/50 распределение без необходимости в состоянии между вызовами.

**Файл:** `supabase/functions/salutespeech-tts/index.ts`

Изменение в функции `pickSlot()`:
```typescript
function pickSlot(): TokenSlot | null {
  if (slots.length === 0) return null;
  if (slots.length === 1) return slots[0];
  // Random distribution (stateless — no shared state between invocations)
  const idx = Math.random() < 0.5 ? 0 : 1;
  return slots[idx];
}
```

Это единственное изменение — 3 строки вместо 10.

