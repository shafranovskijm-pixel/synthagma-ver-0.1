

## История генерации: потоки + таймер

### Проблема
1. Таблица `generation_history` пуста — записи вставляются с `as any`, но ошибки вставки **не логируются** (нет `.then`/`.catch` на insert). Если FK `course_id` невалиден или есть другая проблема — ошибка теряется молча.
2. Нет информации о номере потока и времени выполнения.

### Решение

#### 1. Миграция: добавить колонки `stream_index` и `duration_ms`
```sql
ALTER TABLE generation_history
  ADD COLUMN stream_index smallint DEFAULT NULL,
  ADD COLUMN duration_ms integer DEFAULT NULL;
```

#### 2. `ContentGeneratorTab.tsx` — передавать поток и время
- `processStream` получает параметр `streamIndex: number` (1, 2, 3).
- `processLesson` получает `streamIndex` и замеряет время каждого этапа через `Date.now()`.
- Каждый `insert` в `generation_history` включает `stream_index` и `duration_ms`.
- **Критично**: добавить обработку ошибок на все insert-ы — `console.error` при неудаче, чтобы не терять данные молча.

```typescript
// Пример замера
const start = Date.now();
// ... вызов AI ...
const duration_ms = Date.now() - start;

await supabase.from("generation_history").insert({
  course_id: courseId, course_title: courseTitle,
  action: "content",
  details: `Поток ${streamIndex}: контент «${lesson.title}»`,
  items_count: 1,
  stream_index: streamIndex,
  duration_ms,
});
```

#### 3. `GenerationHistoryTab.tsx` — отображение потока и времени
- Показывать бейдж «Поток N» с цветовой маркировкой (поток 1 — синий, 2 — зелёный, 3 — фиолетовый).
- Показывать длительность в секундах рядом со временем: `14:32 · 4.2с`.
- Добавить фильтр по потоку.

| Файл | Изменение |
|---|---|
| Миграция | `stream_index` + `duration_ms` колонки |
| `ContentGeneratorTab.tsx` | Передавать streamIndex, замерять время, логировать ошибки insert |
| `GenerationHistoryTab.tsx` | Бейдж потока, длительность, фильтр по потоку |

