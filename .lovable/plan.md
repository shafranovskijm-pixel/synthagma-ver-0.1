

## План: Убрать генерацию вопросов, оставить только решение

### Проблема
Пользователь говорит, что вопросы уже есть во всех курсах. Генерация вопросов (`generate_questions`) не нужна — нужно только решать существующие вопросы (находить `correct_answer`).

### Изменения в `src/components/admin/AdminMarketplaceManager.tsx`

1. **Удалить Step 0** (строки 199–237): убрать генерацию структуры курса (`generate-course-structure`), убрать `needsStructure` логику и удаление/пересоздание уроков

2. **Удалить генерацию вопросов** (строки 279–306): убрать блок `emptyTests` + вызов `gigachat` с `action: "generate_questions"`

3. **Упростить подсчёт задач**: убрать `emptyTests.length` из `totalTasks`, убрать `needsStructure` из условия

4. **Оставить**:
   - Генерацию контента для пустых уроков (text/practice)
   - Решение тестов без ответов (`gigachat` action `generate_answers`) — это основная задача
   - Исправление дубликатов заголовков
   - Повторную валидацию

### Файл
- `src/components/admin/AdminMarketplaceManager.tsx`

