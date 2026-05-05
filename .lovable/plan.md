Проблема найдена точно: на `sintagma.com.ru` приложение принудительно отправляет все backend-запросы через legacy-прокси `https://api.sintagma.com.ru`, а этот адрес сейчас недоступен. Поэтому на кастомном домене регистрация не проходит, а в preview Lovable — проходит, потому что там приложение ходит в backend напрямую.

Что подтверждено:
- В `src/utils/proxyFetch.ts` жёстко задан `PROXY_BASE_URL = 'https://api.sintagma.com.ru'`.
- Там же домен `sintagma.com.ru` включён в `FORCE_PROXY_HOSTS_EXACT`, то есть прокси включается всегда.
- В браузере на `https://sintagma.com.ru/register-organization` запрос падает с `net::ERR_TUNNEL_CONNECTION_FAILED` на `https://api.sintagma.com.ru/sb-api/rest/v1/app_settings?...`.
- В preview этого нет, потому что forced proxy для preview не срабатывает.

План исправления:

1. Убрать принудительную зависимость `sintagma.com.ru` от `api.sintagma.com.ru`
- Изменить `src/utils/proxyFetch.ts`, чтобы `sintagma.com.ru` не форсировал legacy-прокси.
- Перевести `PROXY_BASE_URL` на безопасный режим:
  - либо same-origin (`window.location.origin`) для `/sb-api`, `/sb-functions`, `/sb-storage`, `/sb-realtime`,
  - либо пустой base с прямым каналом по умолчанию и fallback только при реальной сетевой блокировке.
- Сохранить lazy fallback-логику только для тех доменов/сред, где прокси реально нужен.

2. Привести UI и тексты в соответствие новой схеме
- Обновить `src/components/ProxyChannelIndicator.tsx`, чтобы он не показывал пользователю, что соединение идёт через `api.sintagma.com.ru`, если это больше не так.
- Обновить `src/pages/admin/ProxySetup.tsx` и `src/utils/nginxProxyConfig.ts` под текущую инфраструктуру: либо same-origin Nginx-префиксы, либо полностью пометить legacy-сценарий как необязательный/архивный.

3. Проверить, что регистрация на кастомном домене снова работает в прямом канале
- Протестировать открытие `/register-organization` на `sintagma.com.ru`.
- Проверить, что первичные запросы (`app_settings`, auth, edge functions) больше не идут на `api.sintagma.com.ru`.
- Проверить, что submit регистрации доходит до backend и не падает на инициализации/автологине.

4. Дать вам короткий список, что можно безопасно удалить во внешней инфраструктуре
- Если после исправления код больше не использует `api.sintagma.com.ru`, перечислю, какие записи/настройки Cloudflare можно снести без влияния на Timeweb/Nginx-схему.
- Отдельно отмечу, какие записи трогать нельзя: основной домен и активные DNS-записи деплоя.

Технические детали:
```text
Сейчас:
  sintagma.com.ru -> frontend
  frontend -> api.sintagma.com.ru/sb-* -> FAIL

После правки:
  sintagma.com.ru -> frontend
  frontend -> backend напрямую
  или
  frontend -> same-origin /sb-* только если это реально настроено и нужно
```

Файлы, которые затрону:
- `src/utils/proxyFetch.ts`
- `src/components/ProxyChannelIndicator.tsx`
- `src/pages/admin/ProxySetup.tsx`
- `src/utils/nginxProxyConfig.ts`

Если одобрите, следующим сообщением сразу внесу правки и затем проверю регистрацию именно на `sintagma.com.ru`.