

## План: улучшение надёжности конвейера

### Проблемы
1. **Rate limit**: батчи по 20 вопросов отправляются без паузы → 429 от ИИ
2. **Прогресс невидим**: счётчик `0/209` обновляется только по завершении курса целиком
3. **Нет retry**: при ошибке на одном батче — весь курс «падает»

### Изменения в `BulkPipelineWidget.tsx`

#### 1. Добавить задержку между батчами
После каждого вызова `gigachat` — пауза 2 секунды (`await new Promise(r => setTimeout(r, 2000))`). Это предотвратит rate limit.

#### 2. Показать реальный прогресс в реальном времени
- Добавить state: `solvedSoFar` (число решённых вопросов в текущем курсе)
- Обновлять `currentPhase` после каждого батча: `"Решаю тесты: 15/50 вопросов"`
- В UI отображать номер текущего курса и подробный статус

#### 3. Retry с экспоненциальной задержкой
При ошибке 429 или network error — повторить через 5, 10, 20 секунд (макс. 3 попытки). Если все 3 неудачны — пропустить батч и продолжить.

#### 4. Не останавливать конвейер при ошибке одного курса
Сейчас `processCourse` бросает исключение → `handleStart` ловит его и помечает курс как error, но ПРОДОЛЖАЕТ цикл. Это работает верно. Проблема в том что при ошибке внутри `processCourse` на этапе решения тестов — функция завершается с `throw`, не доходя до валидации. Нужно обернуть каждый батч в try/catch и продолжать.

### Конкретные правки

**Файл: `src/components/admin/BulkPipelineWidget.tsx`**

1. **Строки 342-368** (цикл батчей тестов): добавить retry-логику и задержку:
```typescript
for (let i = 0; i < qs.length; i += batchSize) {
  if (stopRef.current) return { ok: false, lessonsFilled, testsSolved };
  const batch = qs.slice(i, i + batchSize);
  setCurrentPhase(`Решаю тесты: ${testsSolved}/${unanswered.length} — "${lessonInfo?.title}"`);
  
  let retries = 0;
  while (retries < 3) {
    try {
      const { data, error } = await supabase.functions.invoke("gigachat", { ... });
      if (error) throw error;
      // process answers...
      break; // success
    } catch (e) {
      retries++;
      if (retries >= 3) { console.error(...); break; }
      const delay = retries * 5000;
      setCurrentPhase(`Rate limit, жду ${delay/1000}с...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // Delay between batches
  await new Promise(r => setTimeout(r, 2000));
}
```

2. **Строка 105** (progressPercent): показывать прогресс на основе решённых вопросов, а не только завершённых курсов. Добавить вторую строку прогресса для текущего курса.

### Файлы
- `src/components/admin/BulkPipelineWidget.tsx` — единственный файл

### Результат
- Конвейер будет стабильно работать без 429 ошибок
- Пользователь видит реальный прогресс (сколько вопросов решено)
- При ошибке — автоматический retry, а не остановка

