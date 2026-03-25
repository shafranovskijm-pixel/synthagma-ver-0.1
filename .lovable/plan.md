

## Редирект с синтагма.рф на sintagma.com.ru

### Суть
Добавить в `index.html` (в самое начало, до любой другой логики) проверку домена: если текущий hostname — это `xn--80aaiswd0ak.xn--p1ai` (punycode для `синтагма.рф`), сразу делать `window.location.replace` на `https://sintagma.com.ru` с сохранением пути и параметров.

Это самый надёжный способ — срабатывает до загрузки React, до SW, до кеша.

### Изменения

**`index.html`** — добавить inline-скрипт в `<head>` (первым, до всех остальных скриптов):

```javascript
<script>
  (function(){
    var dominated = ['xn--80aaiswd0ak.xn--p1ai', 'www.xn--80aaiswd0ak.xn--p1ai'];
    if (dominated.indexOf(location.hostname) !== -1) {
      location.replace('https://sintagma.com.ru' + location.pathname + location.search + location.hash);
    }
  })();
</script>
```

Один файл, одно изменение. Клиентский код и `getBaseUrl.ts` уже используют `sintagma.com.ru` как основной домен.

