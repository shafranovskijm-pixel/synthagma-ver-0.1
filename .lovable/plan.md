
# Оптимизация Синтагмы для медленного интернета

## Текущее состояние
Уже реализовано: PWA с service worker (NetworkFirst), lazy loading страниц, retry с экспоненциальной задержкой, recovery-скрипт при зависании. Однако есть ряд существенных пробелов.

## Что будет улучшено

### 1. Настройка QueryClient с кэшированием
Сейчас `new QueryClient()` создаётся без параметров -- данные не кэшируются между навигациями и каждый раз загружаются заново. Добавим:
- `staleTime: 5 минут` -- данные считаются свежими 5 минут, повторные запросы не отправляются
- `gcTime: 30 минут` -- кэш живёт 30 минут в памяти
- `retry: 3` с экспоненциальной задержкой -- автоматические повторы при ошибках сети
- `refetchOnWindowFocus: false` -- не перезагружать данные при переключении вкладок

### 2. Оффлайн-индикатор
Компонент, который показывает предупреждение, когда пропадает интернет, и уведомление о восстановлении. Пользователь понимает, почему что-то не загружается, вместо того чтобы видеть пустой экран.

### 3. Улучшение PWA-кэширования
- Добавить кэширование изображений (CacheFirst, до 100 файлов, 30 дней)
- Добавить кэширование статических ресурсов (JS, CSS) через CacheFirst
- Увеличить TTL для API-кэша до 10 минут

### 4. Оптимизация сборки (code splitting)
Настроить `manualChunks` в Vite для разделения крупных зависимостей:
- `vendor-react` -- React, React DOM, React Router
- `vendor-ui` -- Radix UI, Lucide
- `vendor-charts` -- Recharts
- `vendor-query` -- TanStack Query

Это позволяет браузеру загружать и кэшировать библиотеки отдельно от кода приложения.

### 5. Скелетон-загрузка вместо спиннера
Заменить `LazyLoadFallback` (спиннер) на скелетон-экран с прогресс-баром, чтобы пользователь видел, что приложение загружается, а не зависло.

## Технические детали

### Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/App.tsx` | Настроить `QueryClient` с `staleTime`, `gcTime`, `retry`, `refetchOnWindowFocus` |
| `vite.config.ts` | Добавить `manualChunks`, расширить `runtimeCaching` (images, static assets) |
| `src/components/LazyLoadFallback.tsx` | Скелетон + прогресс-бар вместо спиннера |
| `src/components/OfflineIndicator.tsx` | Новый компонент -- баннер при потере/восстановлении сети |
| `src/App.tsx` | Подключить `OfflineIndicator` |

### QueryClient конфигурация
```text
defaultOptions.queries:
  staleTime: 5 * 60 * 1000   (5 мин)
  gcTime: 30 * 60 * 1000     (30 мин)
  retry: 3
  retryDelay: attempt => Math.min(1000 * 2^attempt, 30000)
  refetchOnWindowFocus: false
```

### Новые runtime-кэши для PWA
```text
images  -> CacheFirst, 100 entries, 30 days
static  -> CacheFirst, 200 entries, 365 days
```

### manualChunks
```text
vendor-react:  react, react-dom, react-router-dom
vendor-ui:     @radix-ui/*, lucide-react, class-variance-authority, clsx, tailwind-merge
vendor-charts: recharts
vendor-query:  @tanstack/react-query
```
