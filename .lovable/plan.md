

## Добавить редирект с синтагма.рф в main.tsx

Редирект в `index.html` есть, но SW на кириллическом домене кеширует старый HTML без него. Нужно добавить редирект в `src/main.tsx` — JS-бандл обновляется независимо от HTML.

### Изменение

**`src/main.tsx`** — добавить после строки 3 (`import "./index.css"`) и до строки 5 (`declare const __BUILD_TIMESTAMP__`):

```typescript
// Redirect from Cyrillic domain to primary domain (bypasses stale SW cache)
const CYRILLIC_DOMAINS = ['xn--80aaiswd0ak.xn--p1ai', 'www.xn--80aaiswd0ak.xn--p1ai'];
if (CYRILLIC_DOMAINS.includes(window.location.hostname)) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  }
  if ('caches' in window) {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
  }
  window.location.replace('https://sintagma.com.ru' + window.location.pathname + window.location.search + window.location.hash);
  throw new Error('Redirecting to primary domain');
}
```

Один файл, одно изменение. Остальной код без изменений.

