

## Импорт тестов из SkillSpace + очистка &nbsp;

### Проблема

1. **Тесты не переносятся** — парсер видит уроки с `type: "test"`, но вместо извлечения вопросов вставляет заглушку «[Тест — требуется ручной перенос]»
2. **Артефакты `&nbsp;`** — текст из EditorJS содержит HTML-сущности `&nbsp;`, которые не очищаются при конвертации

### Решение

**1. Извлечение тестовых вопросов из SkillSpace**

В SkillSpace тесты хранятся в данных урока — в поле `pagesPublished` или `blocks` есть блоки типа `test`/`quiz` с вопросами и вариантами ответов. При обнаружении урока с `type === "test"`:

- Извлечь вопросы из данных урока (обычно в `pages[].content.blocks` будут блоки типа `quiz`/`test` с полями `data.questions`)
- Также проверить прямые поля `lessonData.questions`, `lessonData.test`, `lessonData.quiz`
- Для каждого вопроса: извлечь текст, варианты ответов, правильный ответ
- Создать урок с `type: "test"` и вставить вопросы в таблицу `test_questions` (формат: `options` как массив `{text: string}`, `correct_answer` как индекс или `null`)
- Установить `test_questions_count` и `test_passing_score: 60`

**2. Очистка `&nbsp;` из контента**

Добавить функцию `cleanHtmlEntities(text)` которая:
- Заменяет `&nbsp;` на обычный пробел
- Убирает множественные пробелы подряд
- Применяется ко всем текстовым блокам (paragraph, heading, quote, list, callout) при конвертации из EditorJS

### Изменения

**`supabase/functions/parse-skillspace-course/index.ts`:**

1. Добавить функцию `cleanHtmlEntities(text: string): string` — замена `&nbsp;` → пробел, trim множественных пробелов

2. Вызывать `cleanHtmlEntities` в `convertBlock()` для всех текстовых полей (`data.text`, `data.caption`, etc.)

3. В блоке обработки уроков (строки ~489-533): при `lessonType === "test"` — парсить вопросы из данных урока, сохранять их в массив `testQuestionsToCreate`

4. В Step 5 (сохранение в БД, строки ~710-727): после создания урока с `type: "test"` — вставить вопросы в `test_questions` батчами, обновить `test_questions_count` и `test_passing_score`

5. Добавить логирование: сколько тестовых вопросов извлечено и создано

