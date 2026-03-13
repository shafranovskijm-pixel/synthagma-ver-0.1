

## Проблема

Почти всё уже правильно настроено на 3 слота, но есть одно место, где третий ключ **не подключён**:

| Компонент | Текст (ИИ) | Изображения | Статус |
|---|---|---|---|
| **`_shared/gigachat-client.ts`** | 3 слота ✅ | — | OK |
| **`generate-image/index.ts`** | — | 3 слота ✅ | OK |
| **`generate-course-content/index.ts`** | 3 слота (через shared client) ✅ | **2 слота** ❌ | **Нет KEY_3** |

В файле `generate-course-content/index.ts` (строки 272-276) массив `GIGACHAT_IMAGE_KEYS` включает только `GIGACHAT_AUTH_KEY` и `GIGACHAT_AUTH_KEY_2` — третий ключ `GIGACHAT_AUTH_KEY_3` пропущен. Это значит, что при генерации изображений в конвейере курсов третий API-ключ **не используется** и токены с него не списываются.

## Исправление

**`supabase/functions/generate-course-content/index.ts`**, строки 272-276:

Добавить `GIGACHAT_AUTH_KEY_3` в массив `GIGACHAT_IMAGE_KEYS`:

```typescript
// GigaChat image generation keys (3 slots)
const GIGACHAT_IMAGE_KEYS = [
  Deno.env.get("GIGACHAT_AUTH_KEY"),
  Deno.env.get("GIGACHAT_AUTH_KEY_2"),
  Deno.env.get("GIGACHAT_AUTH_KEY_3"),
].filter(Boolean) as string[];
```

Одна строка — добавить `Deno.env.get("GIGACHAT_AUTH_KEY_3")` в массив. Остальной round-robin код уже работает корректно и автоматически начнёт использовать все 3 слота.

