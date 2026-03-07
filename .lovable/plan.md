

# Анализ: параллельность в проверке и генерации

## Текущее состояние

### Серверный конвейер (`bulk-pipeline/index.ts`) — ✅ 3 потока
- `processInParallel(lessonEntries, 3, solveLesson, ...)` — решение тестов в 3 потока
- `processInParallel(emptyLessons, 3, fillLesson, ...)` — генерация контента в 3 потока
- Использует `callAIRoundRobin` → задачи распределяются по Slot-0, Slot-1, Gemini
- **НО** верификация (`verify_answers`) внутри серверного конвейера — нужно проверить

### Клиентский конвейер (`useBulkPipeline.ts`) — ❌ 1 поток
- Курсы обрабатываются **последовательно** (`for` loop, строка 491)
- Решение тестов внутри курса — **последовательно** (строка 230: `for` по урокам, потом `for` по батчам)
- Верификация — **последовательно** (строка 315: `for` по урокам)
- Генерация контента — **последовательно** (строка 420+)
- Все вызовы идут через `gigachat` edge function (не `callAIRoundRobin`), но `ai_provider` передаётся → на сервере round-robin сработает **только если** `ai_provider === "round_robin"`

### «Проверить все» (`handleBulkValidate`) — ❌ 0 потоков ИИ
- Это просто валидация структуры (проверка наличия уроков, вопросов, дубликатов)
- Не вызывает ИИ вообще — только запросы к БД
- Работает последовательно, но это не критично (быстрые DB-запросы)
- После валидации вызывает `handleBulkAutoFix` → запускает клиентский конвейер

## Что нужно исправить

### 1. Клиентский конвейер — параллелизация батчей тестов и верификации

Внутри `processCourse` в `useBulkPipeline.ts`:
- **Решение тестов**: вместо последовательного `for` по урокам → обрабатывать до 3 уроков параллельно через `Promise.allSettled`
- **Верификация**: аналогично — 3 урока параллельно
- **Генерация контента**: уже есть закомментированная параллельность — включить её

### 2. Убедиться что `ai_provider: "round_robin"` передаётся из клиентского конвейера

Сейчас `aiProvider` берётся из состояния. Нужно проверить что дефолтное значение = `"round_robin"`.

## Файлы для изменений

- `src/hooks/useBulkPipeline.ts` — добавить `processInParallel` хелпер (как в серверном конвейере) и заменить последовательные циклы на параллельные с concurrency=3

## Реализация

```text
// Новый хелпер в useBulkPipeline.ts
async function runParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map(fn));
  }
}

// Решение тестов: было
for (const [lessonId, qs] of byLesson) { ... sequential ... }

// Станет
const lessonEntries = Array.from(byLesson.entries());
await runParallel(lessonEntries, 3, async ([lessonId, qs]) => {
  // ... обработка батчей для урока ...
});

// Аналогично для верификации и генерации контента
```

