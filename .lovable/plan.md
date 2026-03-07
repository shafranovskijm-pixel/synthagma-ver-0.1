

## Проблема

Несовпадение идентификаторов голосов между клиентом и edge-функцией:

- **Клиент** отправляет `voice: "Natalya_24000"` (ID из `SALUTE_VOICES`)
- **Edge-функция** ищет по ключу `natalya` (lowercase, без `_24000`) в словаре `VOICES`, не находит — всегда fallback на `natalya`

Словарь в edge-функции маппит `natalya` → `Nec_24000` (внутренний код SaluteSpeech API), но клиент шлёт `Natalya_24000`, которого нет в словаре.

## Решение

Привести в соответствие ID голосов. Два изменения:

### 1. Edge-функция `salutespeech-tts/index.ts`
Обновить словарь `VOICES`, чтобы ключи совпадали с тем, что шлёт клиент (`Natalya_24000`, `Boris_24000` и т.д.):

```ts
const VOICES: Record<string, string> = {
  "Natalya_24000": "Nec_24000",
  "Boris_24000": "Bys_24000",
  "Marfa_24000": "May_24000",
  "Taras_24000": "Tur_24000",
  "Alexandra_24000": "Ost_24000",
  "Sergey_24000": "Pon_24000",
  // backward compat — lowercase keys from admin panel
  "natalya": "Nec_24000",
  "boris": "Bys_24000",
  "marfa": "May_24000",
  "taras": "Tur_24000",
  "alexandr": "Ost_24000",
  "sergey": "Pon_24000",
};
```

Это сохранит обратную совместимость с админкой, которая шлёт lowercase.

### Файлы для изменения
- `supabase/functions/salutespeech-tts/index.ts` — расширить словарь `VOICES`

