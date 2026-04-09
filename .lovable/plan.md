

## Починка парсера SkillSpace — правильная авторизация

### Корневая причина

Логи функции показывают:
```text
Auth-Token=deleted; Refresh-Token=deleted; Auth-Token=eyJhbGciOiJIUzI1Ni...
```

Две проблемы:
1. **Дублирование cookies** — сервер SkillSpace при логине сначала шлёт `Auth-Token=deleted` (сброс старой сессии), затем новый `Auth-Token=eyJ...`. Текущий код складывает оба, и сервер видит первый — "deleted"
2. **School API требует `Authorization: Bearer`** — REST API SkillSpace для эндпоинтов `/api/rest/school/*` ожидает JWT-токен не только в cookie, но и в заголовке `Authorization: Bearer {token}`. Без этого — 401

Из-за этого `step/list` → 401, функция падает в студенческий fallback, а студенческий API тоже возвращает 403 на все уроки.

### Что исправить

**`supabase/functions/parse-skillspace-course/index.ts`**:

1. **Дедупликация cookies** — при склейке cookies проверять имена: если есть `Auth-Token=deleted` и потом `Auth-Token=eyJ...`, оставлять только последний (актуальный). Реализовать как Map по имени cookie, где каждый следующий перезаписывает предыдущий

2. **Добавить `Authorization: Bearer` заголовок** — извлечь JWT из cookie `Auth-Token` и передавать его во все API-запросы через заголовок `Authorization: Bearer {jwt}`. Это стандарт SkillSpace для школьного API

3. **Улучшить обработку video-блоков** — при конвертации EditorJS в JSON-блоки, для типа `video` извлекать URL и сохранять как `paragraph` с кликабельной ссылкой, а не placeholder "требуется ручной перенос"

### Технические детали

Изменения в `extractCookies` / `apiFetch`:

```text
extractCookies → mergeCookies:
  Вместо простого join всех пар, использовать Map<string, string>
  Каждый новый set-cookie перезаписывает предыдущее значение с тем же именем
  "Auth-Token=deleted" + "Auth-Token=eyJ..." → "Auth-Token=eyJ..."

apiFetch:
  Из cookieMap извлечь значение Auth-Token
  Добавить заголовок: Authorization: Bearer {authToken}
  Оставить Cookie header для совместимости
```

Один файл: `supabase/functions/parse-skillspace-course/index.ts`

### Ожидаемый результат

- School API `/step/list` → 200, все модули и уроки
- School API `/lesson/{uuid}` → 200, полный контент с текстом и ссылками на видео
- Импорт всех ~80+ уроков с содержимым

