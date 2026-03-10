

## Анализ: Третий ключ GigaChat и SaluteSpeech

### Что работает

**SaluteSpeech** — третий ключ полностью интегрирован:
- `salutespeech-tts/index.ts` читает `SALUTESPEECH_AUTH_KEY_3`, создаёт слот с `slotIndex: 2`
- `pickSlot()` использует `Math.random() * slots.length` — равномерно распределяет по всем слотам
- Fallback перебирает все оставшиеся слоты каскадно
- В whitelist `manage-secret` ключ добавлен
- На скриншоте видно: SaluteSpeech Key 3 — «Настроен ✓»

**GigaChat** — третий ключ добавлен в `createSlots()` (строки 146-157), читает `GIGACHAT_AUTH_KEY_3`.

### Найденные проблемы

**1. `manage-secret` — Vault RPC `insert_secret` не существует**

Из логов: `Could not find the function public.insert_secret(name, secret) in the schema cache`. Поэтому GigaChat Key 3 на скриншоте «Не настроен ✗» — ключ не сохраняется при первом добавлении. Функция `update_secret` работает только для уже существующих секретов.

Решение: заменить `rpc("insert_secret")` на прямой SQL через `vault.create_secret()`, или использовать `adminClient.rpc("vault.create_secret")`, или — проще всего — использовать подход с `secrets.create` через Supabase Management API. Самый надёжный вариант: вместо Vault RPC использовать прямой SQL через service role.

**2. GigaChat — retry при exhaustion пробует только 1 дополнительный слот**

Текущая логика (строки 348-364): если slot-0 exhausted, acquireSlot может вернуть slot-1, но если slot-1 тоже exhausted — slot-2 не будет попробован. Нужно перебрать все оставшиеся слоты.

### План исправлений

**1. Починить `manage-secret/index.ts`** — сохранение новых секретов:
- Заменить `rpc("insert_secret")` на SQL-запрос через service role: `SELECT vault.create_secret(secret, name)` через `.rpc()` или через raw query
- Альтернатива: попробовать `vault.secrets` table insert напрямую

**2. Улучшить `callGigaChat()` exhaustion retry** — перебор всех слотов:
- Вместо одной попытки retry, перебрать все оставшиеся слоты по очереди (аналогично SaluteSpeech fallback)
- Пометить exhausted слот чтобы не получить его повторно

### Технические детали

Для `manage-secret` — замена строк 106-112:
```typescript
// Вместо rpc("insert_secret")
const { error: insertError } = await adminClient
  .rpc("create_secret" as any, {
    new_secret: value.trim(),
    new_name: name,
  });
```

Для `callGigaChat` exhaustion — замена строк 347-365: цикл по всем неиспользованным слотам вместо одной попытки.

