

## План: Добавить третьи API-ключи для GigaChat и SaluteSpeech

### Что нужно сделать

Добавить два новых секрета через инструмент `add_secret`:
1. **`GIGACHAT_AUTH_KEY_3`** — третий ключ авторизации GigaChat (Basic auth, base64)
2. **`SALUTESPEECH_AUTH_KEY_3`** — третий ключ авторизации SaluteSpeech (Basic auth, base64)

### Код уже готов

Оба edge-функции (`gigachat-client.ts` и `salutespeech-tts/index.ts`) уже поддерживают третий слот — достаточно добавить секреты, и они автоматически подхватятся:
- GigaChat: строка 146-157 в `gigachat-client.ts` — `GIGACHAT_AUTH_KEY_3`
- SaluteSpeech: строка 137 в `salutespeech-tts/index.ts` — `SALUTESPEECH_AUTH_KEY_3`

### Никаких изменений в коде не требуется

Нужно только ввести значения ключей через интерфейс добавления секретов. После этого оба сервиса начнут использовать 3 параллельных слота с round-robin распределением.

