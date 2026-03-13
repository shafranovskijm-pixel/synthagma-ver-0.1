

## Результат проверки генерации контента

### Найденные проблемы

#### 1. Нет параллельных потоков — всё последовательно
Клиент (`ContentGeneratorTab.tsx`) обрабатывает уроки **строго по одному** в цикле `for`:
```typescript
for (let i = 0; i < emptyOnes.length; i++) {
  const lesson = emptyOnes[i];
  await safeInvoke("gigachat", { body: { action: "generate_content", ... } });
  // ждёт ответа, только потом следующий
}
```
При этом бэкенд (`gigachat-client.ts`) поддерживает 3 GigaChat-слота + Lovable AI и Round-Robin — но клиент никогда не отправляет больше 1 запроса одновременно. Все 3 слота простаивают.

#### 2. Неправильное имя поля провайдера
Клиент отправляет `aiProvider`, а Edge-функция ожидает `ai_provider`. Из-за этого настройка провайдера из `ai_settings` **не применяется** — всегда используется дефолт.

#### 3. Генерация вопросов — тоже последовательно
Тесты обрабатываются по одному в цикле, хотя можно параллельно.

### Исправления

**Файл: `src/components/admin/ContentGeneratorTab.tsx`**

1. **Параллельная генерация контента** — обрабатывать уроки чанками по 3 (`Promise.all`):
```typescript
const PARALLEL = 3;
for (let i = 0; i < emptyOnes.length; i += PARALLEL) {
  const chunk = emptyOnes.slice(i, i + PARALLEL);
  await Promise.all(chunk.map((lesson, idx) =>
    safeInvoke("gigachat", {
      body: { action: "generate_content", courseTitle, lessonTitle: lesson.title, ai_provider: aiProvider, ... }
    }).then(...)
  ));
}
```

2. **Параллельная генерация вопросов** — аналогично, чанками по 3.

3. **Исправить имена полей** — `aiProvider` → `ai_provider`, `gigachatModel` → `gigachat_model`, `lovableModel` → `lovable_model` во всех вызовах `safeInvoke`.

4. **Прогресс** — обновлять после каждого чанка, а не после каждого урока.

### Файлы

| Файл | Действие |
|---|---|
| `src/components/admin/ContentGeneratorTab.tsx` | Параллелизация + исправление имён полей |

### Итого
- **Было**: 1 запрос → ждём → 1 запрос → ждём (16 уроков = 16 последовательных запросов)
- **Станет**: 3 запроса одновременно → ждём → 3 запроса → ... (16 уроков = ~6 раундов, ускорение ~3x)

