

## Диагноз

Из логов видно:
- **KEY** → 402 (Payment Required)
- **KEY_2** → 402 (Payment Required)  
- **KEY_3** → 429 (Too Many Requests)
- **Lovable AI fallback** → тоже 402

Причина 402 от GigaChat: на строке 199 используется модель **`GigaChat-Pro`**, но ваши ключи настроены со скоупом `GIGACHAT_API_PERS` (строка 172). Персональный тариф **не поддерживает модель Pro** — только базовую `GigaChat`. Именно поэтому 2 из 3 ключей возвращают 402 «Payment Required».

Это было сломано предыдущим изменением (смена `GigaChat` → `GigaChat-Pro`).

## Решение

**Файл: `supabase/functions/generate-image/index.ts`**

1. **Строка 199**: Вернуть модель `"GigaChat"` вместо `"GigaChat-Pro"` — базовая модель поддерживается на персональном тарифе (scope `GIGACHAT_API_PERS`).

2. **Строки 339-352**: Убрать Lovable AI fallback — по вашему запросу, всё через GigaChat. При неудаче всех слотов — возвращать понятную ошибку «Все слоты GigaChat временно недоступны, повторите позже» без попытки обращения к Lovable AI.

