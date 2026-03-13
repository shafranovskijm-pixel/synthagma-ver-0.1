

## Проблема

Валидация показывает «Нет тестов», но авто-исправление говорит «Нечего исправлять», потому что:

1. **Строка 538**: при генерации структуры тесты явно исключаются — `.filter(gl => gl.type !== "test")`
2. **Строка 520**: `needsStructure` не учитывает отсутствие тестов
3. **Строка 585**: `totalTasks` считает только пустые уроки, вопросы без ответов и дубликаты — отсутствие тестов не учитывается

Итог: курс без тестов проходит все проверки авто-фикса, и ни одна задача не создаётся.

## Исправление

**Файл: `src/components/admin/AdminMarketplaceManager.tsx`**

1. **Убрать фильтр `gl.type !== "test"`** (строка 538) — разрешить создание тестовых уроков при генерации структуры.

2. **Расширить `needsStructure`** (строка 520) — добавить проверку на отсутствие тестов:
```typescript
const needsStructure = textPracticeLessons.length === 0 
  || currentLessons.length < valRules.minLessons
  || (valRules.requireTest && testLessons.length === 0);
```

3. **Добавить создание теста как отдельную задачу** — если после генерации структуры тестов всё ещё нет (ИИ мог не включить тест в структуру), создать тестовый урок вручную:
```typescript
// После генерации структуры и re-fetch
const updatedTests = allLessons.filter(l => l.type === "test");
if (valRules.requireTest && updatedTests.length === 0) {
  const maxOrder = allLessons.reduce((mx, l) => Math.max(mx, l.order_index ?? 0), -1);
  await supabase.from("lessons").insert({
    course_id: courseId,
    title: "Итоговый тест",
    type: "test",
    order_index: maxOrder + 1,
    content: null,
  });
  // Re-fetch again
}
```

4. **Генерация вопросов для пустых тестов** — после создания тестового урока, вызвать `generate_questions` для тестов без вопросов, чтобы тест был наполнен:
```typescript
const emptyTests = allLessons.filter(l => l.type === "test" && !testQuestionsByLesson.has(l.id));
for (const test of emptyTests) {
  // invoke generate_questions for this test
}
```

5. **Учесть пустые тесты в `totalTasks`** — добавить `emptyTests.length` к счётчику задач.

### Файлы

| Файл | Действие |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | Исправить логику авто-фикса |

