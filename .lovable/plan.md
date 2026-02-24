

## Автоматический cache-bust для PWA

### Проблема
Сейчас Service Worker может кэшировать устаревшие версии приложения, что приводит к белому экрану. Ручной cache-bust через комментарии в `index.html` ненадежен.

### Решение

Настроить Vite и Workbox так, чтобы при каждой сборке автоматически генерировались уникальные хэши, а старый кэш гарантированно очищался.

### Изменения

**1. `vite.config.ts` -- улучшить конфигурацию Workbox:**
- Добавить `sourcemap: true` для отладки проблем с SW
- Добавить в `runtimeCaching` стратегию `NetworkFirst` для API-запросов к Supabase и для навигационных запросов (HTML), чтобы браузер всегда получал свежую версию при наличии сети
- Добавить `revision: null` подход через `additionalManifestEntries` не нужен -- Vite уже добавляет хэши в имена файлов. Вместо этого ограничим `maxAgeSeconds` для HTML-кэша

**2. `src/main.tsx` -- добавить принудительную проверку обновлений SW:**
- Добавить периодическую проверку обновлений SW каждые 60 секунд через `registration.update()`
- Добавить обработку `onRegistered` callback для доступа к объекту registration
- Добавить очистку старых кэшей при обнаружении нового SW через `caches.keys()` и `caches.delete()`

### Технические детали

**`vite.config.ts`** -- добавить в `runtimeCaching`:
```js
{
  urlPattern: /\/index\.html$/,
  handler: "NetworkFirst",
  options: {
    cacheName: "html-cache",
    expiration: { maxAgeSeconds: 60 * 60 }, // 1 час
  },
},
{
  urlPattern: /^https:\/\/.*supabase.*\/.*/i,
  handler: "NetworkFirst",
  options: {
    cacheName: "api-cache",
    expiration: { maxEntries: 50, maxAgeSeconds: 300 },
  },
}
```

**`src/main.tsx`** -- обновить регистрацию SW:
```js
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Очистить все SW-кэши перед перезагрузкой
    caches.keys().then(names => {
      Promise.all(names.map(name => caches.delete(name)))
        .then(() => window.location.reload());
    });
  },
  onOfflineReady() {
    console.log('App ready for offline use');
  },
  onRegistered(registration) {
    // Проверять обновления каждые 60 секунд
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 1000);
    }
  },
});
```

**`src/vite-env.d.ts`** -- добавить `onRegistered` в типы (если ещё нет).

### Результат
- SW будет автоматически проверять обновления каждую минуту
- При обнаружении новой версии -- все кэши очищаются и страница перезагружается
- HTML всегда загружается по сети (NetworkFirst), JS/CSS кэшируются с хэшами в именах файлов
- Старые кэши автоматически удаляются (`cleanupOutdatedCaches: true` уже есть)

