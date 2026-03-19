

## Системная защита от устаревшего кеша PWA + кнопка сброса для админа

### Проблема
Домен синтагма.рф показывает старый интерфейс из-за устаревшего Service Worker, который обслуживает закешированные файлы. Текущий механизм версионирования в `main.tsx` не срабатывает, если сам `main.tsx` подаётся из старого кеша SW.

### План

#### 1. Усилить inline-скрипт в `index.html`
Добавить **до** `<script type="module" src="/src/main.tsx">` inline-скрипт с хардкодным номером версии кеша. Он выполняется до любого закешированного JS и принудительно чистит старые SW:

```javascript
(function(){
  var CACHE_VER = 'v2026-03-19';
  var key = '__cache_ver';
  if (localStorage.getItem(key) !== CACHE_VER) {
    // Удаляем все SW и кеши
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs){
        regs.forEach(function(r){ r.unregister(); });
      });
    }
    if ('caches' in window) {
      caches.keys().then(function(names){
        names.forEach(function(n){ caches.delete(n); });
      });
    }
    localStorage.setItem(key, CACHE_VER);
    if (localStorage.getItem(key + '-init')) {
      location.reload();
      return;
    }
    localStorage.setItem(key + '-init', '1');
  }
})();
```

При каждом деплое версия `CACHE_VER` обновляется автоматически через `__BUILD_TIMESTAMP__` — но хардкодная версия решает проблему **прямо сейчас** для всех пользователей со старым кешем.

#### 2. Создать таблицу `app_settings` для удалённого сброса кеша
Одна строка с `force_cache_version` (text). Админ нажимает кнопку → обновляет значение → клиенты при загрузке проверяют и сбрасывают кеш если версия изменилась.

#### 3. Добавить проверку удалённой версии в `main.tsx`
При старте приложения — один запрос к `app_settings` → сравнение с `localStorage('remote-cache-ver')` → если отличается, `purgeAllCaches()` + reload.

#### 4. Добавить кнопку «Сбросить кеш у всех пользователей» в админке
В настройках организации или в общих настройках платформы. По нажатию обновляет `force_cache_version` в `app_settings`.

### Файлы

| Файл | Действие |
|------|----------|
| `index.html` | Обновить inline-скрипт — хардкодная версия кеша |
| `src/main.tsx` | Добавить проверку удалённой версии из БД |
| `src/utils/remoteCacheCheck.ts` | Создать — запрос к `app_settings` |
| Миграция БД | Создать таблицу `app_settings` с `force_cache_version` |
| Компонент в админке | Добавить кнопку сброса кеша |

