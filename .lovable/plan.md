

## Исправление парсера SkillSpace — окончательное решение на основе реальных заголовков

### Что показали данные из DevTools

Браузер при обращении к school API отправляет:
- `Cookie: ...; Auth-Token=eyJ...` — токен внутри cookie
- `accept: application/json, text/plain, */*`
- Стандартные sec-* заголовки
- **НЕТ** заголовка `Authorization`
- **НЕТ** заголовка `X-Requested-With`

### Найденные баги в текущей функции

1. **`cookieMap` на уровне модуля** (строка 153) — `Map` живёт между вызовами на warm-инстансе Deno. При повторном импорте куки от предыдущего вызова смешиваются с новыми, создавая невалидную сессию

2. **Лишний `Authorization: Bearer` заголовок** (строка 309) — SkillSpace school API авторизует ТОЛЬКО по Cookie, не по Authorization header. Этот заголовок может ломать запрос

3. **Лишний `X-Requested-With: XMLHttpRequest`** (строка 306) — браузер его не отправляет

4. **Логика "deleted" в cookie** (строки 171-177) — текущий порядок: если `deleted` приходит первым, удаляем из Map, затем реальное значение перезаписывает. Но если `deleted` приходит последним — удаляем реальное значение. Нужно обрабатывать ВСЕ set-cookie по порядку и оставлять последнее значение

### Исправления

**`supabase/functions/parse-skillspace-course/index.ts`**:

1. Перенести `cookieMap` внутрь handler-функции (Deno.serve callback), чтобы каждый запрос начинался с чистого состояния

2. В `apiFetch` убрать `Authorization` и `X-Requested-With`, оставить только:
   - `Accept: application/json, text/plain, */*`
   - `Cookie: {all cookies}`

3. В `mergeCookiesFromResponse` — просто перезаписывать значение по имени без специальной логики для "deleted" (последнее значение в порядке set-cookie всегда побеждает)

4. Добавить sec-fetch-* заголовки для имитации браузерного запроса:
   - `sec-fetch-dest: empty`
   - `sec-fetch-mode: cors`  
   - `sec-fetch-site: same-origin`

Один файл, четыре точечных правки.

