

## Исправление белого экрана -- настоящая корневая причина

### Диагностика

Опубликованный сайт (`synthagma-bloom.lovable.app`) подтверждённо показывает белый экран. Превью работает нормально. APK не влияет на браузерный кэш сайта -- это совершенно разные контексты.

### Корневая причина: `navigateFallback` блокирует обновление HTML

В конфигурации Workbox есть фатальный конфликт:

1. **`navigateFallback: '/index.html'`** -- говорит SW: "для всех навигационных запросов отдавай `index.html` из precache"
2. **`runtimeCaching` с NetworkFirst для `index.html`** -- говорит SW: "загружай HTML по сети в первую очередь"

Проблема: `navigateFallback` работает на уровне precache и **имеет приоритет** над `runtimeCaching`. Поэтому стратегия NetworkFirst для HTML **никогда не срабатывает** -- старый HTML всегда подаётся из precache.

Дополнительный конфликт:
- `skipWaiting: true` + `clientsClaim: true` заставляют SW активироваться немедленно (поведение autoUpdate)
- `registerType: "prompt"` ожидает ручного подтверждения обновления
- Эти настройки противоречат друг другу

### Решение

**1. `vite.config.ts`** -- убрать конфликтующие настройки Workbox:

- Удалить `navigateFallback` -- пусть навигационные запросы идут в сеть напрямую, а не из precache
- Удалить `navigateFallbackDenylist` -- больше не нужен без `navigateFallback`  
- Удалить `skipWaiting: true` и `clientsClaim: true` -- они конфликтуют с `registerType: "prompt"`
- Оставить `runtimeCaching` с NetworkFirst для HTML и Supabase API
- Добавить стратегию NetworkFirst для навигационных запросов (все страницы) в `runtimeCaching`

```js
workbox: {
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
  globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      // Все навигационные запросы -- всегда сеть в первую очередь
      urlPattern: ({request}) => request.mode === 'navigate',
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-cache",
        expiration: { maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/.*supabase.*\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-cache",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
      },
    },
  ],
},
```

**2. `src/main.tsx`** -- без изменений, текущая логика корректна.

**3. `index.html`** -- без изменений, recovery-скрипт корректен и будет работать лучше без `navigateFallback`.

### Почему это сработает

Без `navigateFallback` навигационные запросы не перехватываются precache, а попадают в `runtimeCaching` с NetworkFirst. Это значит:
- При наличии сети -- всегда загружается свежий HTML с сервера
- При отсутствии сети -- используется кэшированная версия
- Recovery-скрипт наконец сможет работать, потому что после очистки кэшей и перезагрузки новый HTML будет загружен с сервера, а не из precache

### Почему APK не при чём

Старый APK использует Capacitor WebView -- это полностью изолированный контекст. Он не влияет на кэши браузера Chrome, Safari или Firefox. Белый экран в браузере вызван исключительно конфигурацией Service Worker.

### После публикации

После нажатия Publish > Update:
- Новый SW будет установлен у пользователей
- При следующей загрузке навигационные запросы пойдут на сервер
- Если у кого-то ещё остался старый SW, recovery-скрипт сработает через 8 секунд, очистит кэши и перезагрузит страницу
