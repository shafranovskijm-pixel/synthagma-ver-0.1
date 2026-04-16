

# Рефакторинг по рекомендациям DevTools

## Что делаем

Работаем с двумя предупреждениями из DevTools:

1. **parse-skillspace-course — 1146 строк** → разбиение на модули
2. **Обновление статусов рекомендаций** в devToolsData.ts

---

## Задача 1: Разбиение parse-skillspace-course (1146 → ~350 строк)

Edge-функция содержит 5 логических блоков, которые можно вынести в `_shared`:

### Новые файлы:

| Файл | Содержимое | ~Строк |
|------|-----------|--------|
| `supabase/functions/_shared/editorjs-converter.ts` | `cleanHtml`, `editorBlocksToJsonBlocks`, `convertBlock`, `flattenListItems`, `renderTableHtml`, `makeId` | ~160 |
| `supabase/functions/_shared/skillspace-auth.ts` | `mergeCookiesFromResponse`, `getCookieHeader`, `getAuthToken`, `apiFetch` factory | ~100 |
| `supabase/functions/_shared/skillspace-media.ts` | `downloadAndReupload`, `extFromContentType`, `extFromUrl`, обработка блоков медиа | ~140 |
| `supabase/functions/_shared/skillspace-lessons.ts` | Извлечение уроков (Strategy A/B), парсинг тестов (3 стратегии), парсинг контента | ~250 |

### Итоговый index.ts (~300 строк):
- CORS + входная валидация
- Вызов auth → получение уроков → парсинг контента → медиа → сохранение в БД
- Два режима (create/update) остаются в index.ts как оркестратор

---

## Задача 2: Обновление devToolsData.ts

- Рекомендация `parse-skillspace-size` → статус `applied`, обновить текст
- Рекомендация `test-coverage` — оставить как есть (не решаем сейчас)

---

## Технические детали

- Edge functions поддерживают `import` из `../_shared/` — уже используется для `gigachat-client.ts` и `rate-limiter.ts`
- Все экспортируемые функции будут типизированы
- Логика `Deno.serve` и Supabase client остаётся в `index.ts`
- Функция будет автоматически переразвёрнута после изменений

