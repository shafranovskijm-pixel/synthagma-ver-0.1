

## Проблема

Практические занятия (`type === "practice"`) проходят через тот же промпт `generate_content`, что и текстовые лекции. Промпт говорит «напиши учебный материал» — ИИ генерирует лекцию вместо практического задания. Тип урока вообще не передаётся в edge-функцию.

## Решение

### 1. `src/components/admin/ContentGeneratorTab.tsx`
Передавать `lessonType` в запрос `generate_content`:
```typescript
body: {
  action: "generate_content",
  courseTitle,
  lessonTitle: lesson.title,
  lessonType: lesson.type, // ← добавить
  ...
}
```

### 2. `supabase/functions/gigachat/index.ts`
В блоке `generate_content` — проверять `lessonType`. Если `"practice"`, использовать специализированный промпт:

```
Создай практическое задание (кейс / ситуационную задачу).
Структура: описание ситуации → вводные данные → задание → вопросы для анализа → ожидаемый результат.
Включи раздел «Нормативная база». Минимум 400 слов.
```

Для `"text"` — оставить текущий промпт без изменений.

| Файл | Изменение |
|---|---|
| `ContentGeneratorTab.tsx` | Добавить `lessonType` в body запроса |
| `gigachat/index.ts` | Отдельный промпт для practice в `generate_content` |

