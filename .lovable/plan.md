

## Проблема: двойная работа при генерации тестов

Шаг 3 (`generate_questions`) уже возвращает `correctAnswer` (camelCase) в JSON от ИИ, но клиент сохраняет `q.correct_answer` (snake_case) — это поле `undefined`. В результате все вопросы записываются с `correct_answer: null`, и Шаг 4 (`generate_answers`) вынужден заново решать все вопросы — это двойная работа и лишние вызовы ИИ.

## Исправление

**Файл: `src/components/admin/ContentGeneratorTab.tsx`** (строки 260-268)

Заменить маппинг при сохранении вопросов — использовать `q.correctAnswer` (camelCase, как возвращает ИИ):

```typescript
for (const q of qData.questions) {
  await supabase.from("test_questions").insert({
    lesson_id: test.id,
    question: q.question,
    options: q.options,
    correct_answer: q.correctAnswer ?? q.correct_answer ?? null,
  });
}
```

Это гарантирует, что `correctAnswer` из ответа ИИ сразу сохраняется в БД. Шаг 4 всё ещё останется как страховка — он обработает только вопросы, где ИИ по какой-то причине не указал ответ.

