

## Исправление двух багов в тестовом редакторе

### Проблема 1: Кнопка «Ответы через AI» — текст не видно
Кнопка использует `text-accent-foreground` (почти чёрный цвет `hsl(0, 0%, 5%)`) на тёмном фоне. Текст сливается с фоном.

**Исправление**: Заменить классы кнопки на `border-primary/50 text-primary hover:bg-primary/10` — аналогично соседней кнопке «Сгенерировать вопросы с AI».

**Файл**: `src/components/course-builder/SortableLessonItem.tsx`, строка 384.

### Проблема 2: «Сгенерировать ИИ» для пояснений — ошибка Edge Function

Edge-функция `generate-explanation` получает `correctAnswer`, который может быть `null` (ответ не выбран). Тогда `options[null]` = `undefined`, промпт ломается и AI возвращает ошибку.

**Исправления**:
1. **`generate-explanation/index.ts`**: Добавить проверку `correctAnswer` — если `null`/`undefined`, вернуть 400 с понятным сообщением «Сначала отметьте правильный ответ».
2. **`TestQuestionEditor.tsx`** (`generateExplanation`): Перед вызовом проверять, что `correct_answer !== null && correct_answer !== undefined`. Если нет — показать toast «Сначала отметьте правильный ответ».

### Файлы для изменения

| Файл | Изменение |
|---|---|
| `src/components/course-builder/SortableLessonItem.tsx` | Исправить классы кнопки «Ответы через AI» |
| `src/components/course-builder/TestQuestionEditor.tsx` | Проверка `correct_answer` перед вызовом генерации |
| `supabase/functions/generate-explanation/index.ts` | Валидация `correctAnswer` на бэкенде |

