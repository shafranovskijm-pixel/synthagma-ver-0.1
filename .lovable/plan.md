

## Добавление второго потока API для SaluteSpeech

### Проблема
Сейчас SaluteSpeech использует один ключ `SALUTESPEECH_AUTH_KEY`. При высокой нагрузке или rate-limit'ах запросы могут блокироваться. У GigaChat уже реализован пул слотов с двумя ключами — нужно сделать аналогично для SaluteSpeech.

### Решение

**1. Edge-функция `supabase/functions/salutespeech-tts/index.ts`**
- Реализовать систему слотов (аналогично `gigachat-client.ts`):
  - Слот 0: `SALUTESPEECH_AUTH_KEY` (основной)
  - Слот 1: `SALUTESPEECH_AUTH_KEY_2` (опциональный, подключается если секрет задан)
- Каждый слот хранит свой `cachedToken` и `tokenExpiresAt` (токены SaluteSpeech живут 30 минут)
- Round-robin: выбирать первый свободный слот; при ошибке — пробовать второй
- Логирование: какой слот использовался

**2. Админ-панель `src/components/admin/AISettingsManager.tsx`**
- Добавить `SALUTESPEECH_AUTH_KEY_2` в список API-ключей с лейблом "SaluteSpeech Key 2"
- Добавить `SALUTESPEECH_AUTH_KEY` (Key 1) — сейчас его нет в списке отображаемых ключей

### Файлы
1. `supabase/functions/salutespeech-tts/index.ts` — пул слотов с кэшированием токенов и fallback
2. `src/components/admin/AISettingsManager.tsx` — отображение двух ключей SaluteSpeech

