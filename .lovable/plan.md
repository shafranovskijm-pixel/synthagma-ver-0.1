

## Проблема

Голос SaluteSpeech **всегда один и тот же**, потому что edge-функция передаёт `voice` и `format` как **HTTP-заголовки** (`Voice-Name`, `Audio-Encoding`), тогда как SaluteSpeech API ожидает их как **query-параметры URL**.

Из [официальной документации](https://developers.sber.ru/docs/ru/salutespeech/rest/post-speech-synthesis):
- `voice` — **query parameter** (по умолчанию `May_24000`, т.е. Марфа)
- `format` — **query parameter** (по умолчанию `wav16`)

API просто игнорирует неизвестные заголовки и всегда использует голос по умолчанию.

Дополнительно: код голоса Kira в нашем маппинге неверный — `Kir_24000` вместо правильного `Kin_24000`.

## Решение

### Файл: `supabase/functions/salutespeech-tts/index.ts`

1. **Перенести `voice` и `format` из заголовков в query-параметры URL**:

```ts
// Было:
const url = "https://smartspeech.sber.ru/rest/v1/text:synthesize";
// headers: { "Voice-Name": voiceParam, "Audio-Encoding": format }

// Станет:
const audioFormat = format === "wav16" ? "wav16" : format === "pcm16" ? "pcm16" : "opus";
const url = `https://smartspeech.sber.ru/rest/v1/text:synthesize?voice=${voiceParam}&format=${audioFormat}`;
// headers: только Authorization и Content-Type
```

2. **Убрать заголовки `Voice-Name` и `Audio-Encoding`** из запроса синтеза — они не нужны.

3. **Исправить код голоса Kira**: `Kir_24000` → `Kin_24000` (и `kira` → `Kin_24000`).

