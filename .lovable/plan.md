

## Проблема

В `supabase/functions/generate-image/index.ts`, строка 199:
```typescript
model: "GigaChat",
```

Используется **базовая модель GigaChat**, которая медленнее и хуже генерирует изображения. Для генерации изображений GigaChat рекомендует использовать модель **GigaChat-Pro** (не Max — Max не поддерживает генерацию изображений через function_call).

> Примечание: GigaChat-Max используется для текстовых задач (analyze_visuals и др.), а для **генерации изображений** оптимальная модель — `GigaChat-Pro`.

## Решение

**Файл: `supabase/functions/generate-image/index.ts`**, строка 199

Заменить:
```typescript
model: "GigaChat",
```
На:
```typescript
model: "GigaChat-Pro",
```

Одно изменение, одна строка. Это должно ускорить генерацию и повысить качество изображений.

