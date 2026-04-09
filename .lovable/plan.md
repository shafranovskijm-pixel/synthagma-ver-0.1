

## Исправление парсера SkillSpace — правильные API-эндпоинты

### Проблема

Парсер использует неправильные API-эндпоинты:
- `/api/rest/student/...` — доступ только к потоку студента (6 из 81 урока), контент = 403
- `/api/rest/constructor/...` — не существует (404)

### Правильные эндпоинты (подтверждено через браузер)

| Назначение | Эндпоинт |
|-----------|----------|
| Список групп + уроков | `GET /api/rest/school/course/{id}/step/list` |
| Метаданные курса | `GET /api/rest/school/course/{id}` |
| Контент урока | `GET /api/rest/school/lesson/{uuid}` |

### Структура данных

**step/list** возвращает массив групп:
```text
[
  { id, uuid, name, order, lessons: [
    { id, uuid, name, order, type: "default"|"test", status }
  ]}
]
```

**lesson/{uuid}** возвращает урок с контентом в формате EditorJS:
```text
{ id, uuid, name, type, pagesPublished: [
  { title, content: { blocks: [
    { type: "paragraph", data: { text: "..." } },
    { type: "header", data: { text: "...", level: 3 } },
    { type: "image", data: { url: "...", caption: "..." } },
    { type: "nestedList", data: { items: [...], style: "unordered" } }
  ]}}
]}
```

### Изменения

**`supabase/functions/parse-skillspace-course/index.ts`** — полная переработка:

1. **Авторизация** — оставить как есть (работает)
2. **Получение списка уроков** — заменить все стратегии на:
   - Приоритет 1: `GET /api/rest/school/course/{id}/step/list` (owner/admin)
   - Приоритет 2: `GET /api/rest/student/course/{id}` + извлечение из flows (fallback для студентов)
3. **Получение контента урока** — заменить на:
   - Приоритет 1: `GET /api/rest/school/lesson/{uuid}` 
   - Приоритет 2: `GET /api/rest/student/lesson/{uuid}`
4. **Парсинг контента** — конвертация EditorJS блоков в HTML:
   - `paragraph` → `<p>text</p>`
   - `header` → `<h{level}>text</h{level}>`
   - `image` → `<img src="url">`
   - `nestedList` → `<ul>/<ol>` 
   - `video` → placeholder
5. **Сохранение** — группы как модули, уроки с правильными названиями и контентом

### Один файл для изменения

`supabase/functions/parse-skillspace-course/index.ts`

