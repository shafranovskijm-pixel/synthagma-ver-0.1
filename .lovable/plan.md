

# Страховка от ошибок и зависаний — анализ и план

## Что уже есть

| Защита | Клиент (`useBulkPipeline`) | Сервер (`bulk-pipeline`) |
|--------|---------------------------|-------------------------|
| Retry 3x с backoff | ✅ | ✅ |
| Остановка по кнопке | ✅ `stopRef` | ✅ `shouldStop()` |
| Проверка 402 (кредиты) | ✅ `checkFor402` | ✅ |
| Таймаут edge function | — | ✅ 4 мин → `partial` |
| Resume после обрыва | ✅ localStorage | ✅ auto-resume `partial` |
| Пропуск сбойных батчей | ✅ `skippedBatches++` | ✅ |

## Чего НЕТ (уязвимости)

1. **Нет таймаута на единичный AI-вызов** — если `callAI` или `supabase.functions.invoke("gigachat")` зависнет, весь конвейер встанет навечно. Нет `AbortController` / `setTimeout`.

2. **Нет heartbeat для серверных запусков** — если edge function упала (crash, OOM), статус остаётся `running` навсегда. Клиент бесконечно поллит мёртвый run.

3. **Нет stale run detection** — при mount клиент находит `running` run и просто поллит, не проверяя, что `updated_at` давно не менялся.

4. **Нет общего таймаута конвейера** — клиентский конвейер может работать часами без ограничений.

5. **`parallelMap` без таймаута** — если один из 2 параллельных воркеров зависнет, второй тоже ждёт.

6. **Polling не останавливается при ошибке сети** — если `supabase.from().select()` падает, polling продолжает молча.

---

## План реализации

### 1. Таймаут на AI-вызовы (клиент + сервер)

**Клиент (`useBulkPipeline.ts`):** обернуть каждый `supabase.functions.invoke("gigachat")` в `Promise.race` с 90-секундным таймаутом:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms/1000}s)`)), ms))
  ]);
}
```

**Сервер (`bulk-pipeline/index.ts`):** обернуть `callAI()` в аналогичный таймаут 120с.

### 2. Heartbeat + Stale detection

**Сервер:** обновлять `updated_at` каждые 30 секунд в цикле обработки (уже частично делается при `updatePhase`, но добавить явный heartbeat в длинных операциях).

**Клиент (`useServerPipeline.ts`):** при polling проверять `updated_at` — если >5 минут назад и статус `running`, считать run зависшим:

```typescript
const updatedAt = new Date(run.updated_at).getTime();
if (run.status === "running" && Date.now() - updatedAt > 300_000) {
  // Stale run — mark as partial, try resume
}
```

### 3. Общий таймаут клиентского конвейера

Добавить `MAX_CLIENT_RUNTIME = 2 * 60 * 60 * 1000` (2 часа). Если конвейер работает дольше — автоматически остановить с сохранением прогресса.

### 4. Таймаут в `parallelMap`

Обернуть каждый вызов `fn(item)` в `withTimeout(fn(item), 120_000)`. При таймауте — логировать ошибку, продолжать со следующим.

### 5. Устойчивый polling

Добавить счётчик ошибок polling. После 5 подряд неудачных poll-запросов — остановить polling, показать toast с предупреждением и кнопкой «Переподключить».

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/hooks/useBulkPipeline.ts` | `withTimeout` обёртка для AI-вызовов, общий таймаут конвейера, таймаут в `parallelMap` |
| `src/hooks/useServerPipeline.ts` | Stale run detection, устойчивый polling с error counter |
| `supabase/functions/bulk-pipeline/index.ts` | Таймаут на `callAI`, heartbeat в длинных циклах |

Все изменения обратно совместимы — при отсутствии зависаний поведение не меняется.

