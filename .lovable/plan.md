

# Видео — загрузка в Lovable Cloud вместо внешнего хранилища

## Суть
Новые видео будут загружаться в встроенное хранилище Lovable Cloud (бакет `course-files`), а не во внешний Supabase. Старые видео, уже загруженные во внешнее хранилище, продолжат работать — ссылки на них не изменятся.

## Что изменится

### Файл: `src/hooks/useLessonMedia.ts`
- Функция `getStorageConfig` перестанет проверять внешний Supabase — всегда будет использовать встроенное хранилище (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, бакет `course-files`)
- Убрать вызов `safeInvoke('get-external-storage-config')` из этой функции
- Убрать все упоминания `useExternal` из логики загрузки и toast-сообщений

### Файл: `src/hooks/useLessonMedia.ts` (генерация контента)
- В блоке генерации аудио TTS (~строка 230) убрать `initExternalSupabase()` / `getExternalSupabase()` — всегда использовать основной `supabase` клиент для загрузки аудио

### Старые видео
- Никаких миграций данных — ссылки на внешнее хранилище остаются в полях `content` уроков и продолжают работать как обычные URL

## Техническая реализация

Упрощённый `getStorageConfig`:
```typescript
const getStorageConfig = useCallback(async () => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const { data: session } = await supabase.auth.getSession();
  const authToken = session?.session?.access_token || apiKey;
  return { baseUrl, apiKey, authToken, bucketName: 'course-files' };
}, []);
```

Один файл, минимальные изменения. Внешний клиент (`external-supabase/client.ts`) и edge-функция `get-external-storage-config` остаются на месте (могут использоваться другими частями системы).

