
## Поддержка 3 потоков для GigaChat и SaluteSpeech

### Текущее состояние

**GigaChat:** `_shared/gigachat-client.ts` создает пул слотов, но поддерживает только 2 ключа (`GIGACHAT_AUTH_KEY` и `GIGACHAT_AUTH_KEY_2`). Третий ключ `GIGACHAT_AUTH_KEY_3` уже есть в whitelist (`manage-secret`) и UI (`AISettingsManager`), но не используется в пуле.

**SaluteSpeech:** `salutespeech-tts/index.ts` поддерживает только 2 слота. Третий ключ `SALUTESPEECH_AUTH_KEY_3` нигде не упоминается.

### Изменения

**1. `supabase/functions/_shared/gigachat-client.ts`** — добавить третий слот:
- В `createSlots()` после проверки `GIGACHAT_AUTH_KEY_2` добавить аналогичную проверку `GIGACHAT_AUTH_KEY_3` и создание `slot-2`
- Лог: "Pool initialized with N slots"

**2. `supabase/functions/salutespeech-tts/index.ts`** — добавить третий слот:
- В `buildSlots()` добавить чтение `SALUTESPEECH_AUTH_KEY_3` и создание слота с `slotIndex: 2`
- В `pickSlot()` обновить логику выбора для 3 слотов (random из доступных вместо бинарного выбора)

**3. `supabase/functions/manage-secret/index.ts`** — добавить `SALUTESPEECH_AUTH_KEY_3` в whitelist `ALLOWED_SECRETS`

**4. `src/components/admin/AISettingsManager.tsx`** — добавить `{ name: "SALUTESPEECH_AUTH_KEY_3", label: "SaluteSpeech Key 3" }` в `API_KEYS_LIST`

Все 4 изменения минимальны и механически повторяют существующий паттерн для KEY_2.
