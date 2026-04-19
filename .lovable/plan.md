
## План

### 1. Скрыть кнопки «Войти через Яндекс ID»
Временно убрать `YandexLoginButton` из `src/pages/Login.tsx` и `src/pages/RegisterOrganization.tsx` (просто закомментировать импорт + использование, чтобы потом легко вернуть). Сами edge-функции, таблицы и страницу `/auth/yandex/callback` оставляем — они готовы и ждут тестирования.

### 2. Изучить актуальную документацию Telemost API
Прочитать https://yandex.ru/dev/telemost/doc/ru/ через `code--fetch_website`, чтобы зафиксировать:
- точный endpoint создания конференции,
- требуемые scope OAuth-токена,
- формат заголовка авторизации (`OAuth <token>` vs `Bearer <token>`),
- какие тарифы Яндекс 360 реально дают доступ к API,
- как именно Яндекс отвечает `ApiRestrictedToOrganizations` и что с этим делать.

Сейчас в `telemost-create-conference/index.ts` мы:
- используем `Authorization: OAuth <token>`,
- бьём в `https://cloud-api.yandex.net/v1/telemost-api/conferences`,
- получаем `403 ApiRestrictedToOrganizations`.

Нужно сверить всё это с документацией один-в-один.

### 3. Получить точный fingerprint токена и тело ответа
Запустить `telemost-create-conference` ещё раз через `supabase--curl_edge_functions` от вашего пользователя, чтобы свежие логи показали:
- `tokenFingerprint` (длина / префикс / суффикс),
- сырой ответ Яндекса (статус + JSON с `error`, `error_description`, `request_id`).

`request_id` от Яндекса — ключевая штука для техподдержки.

### 4. Подготовить чёткий запрос в техподдержку Яндекс 360
На основе ответа Яндекса собрать одно сообщение, которое можно скопировать и отправить. Шаблон:

```text
Здравствуйте.

Аккаунт: <ваш email в Яндекс 360>
Организация в Яндекс 360: <название>
Тариф Яндекс 360: <название тарифа, дата активации>
OAuth-приложение (client_id): <client_id из oauth.yandex.ru>
Scope токена: telemost-api:conferences.create (и др., если документация требует)

Что делаю:
POST https://cloud-api.yandex.net/v1/telemost-api/conferences
Headers:
  Authorization: OAuth <token c length=NN, prefix=XXXX, suffix=YYYY>
  Content-Type: application/json
Body:
  { "access_level": "PUBLIC", "live_stream": { ... } }

Что получаю:
HTTP 403
{
  "error": "ApiRestrictedToOrganizations",
  "description": "Forbidden",
  "message": "API доступен пользователям Яндекс 360 для бизнеса.",
  "request_id": "<сюда подставим из ответа>"
}

Вопрос:
1. Подтвердите, что мой тариф Яндекс 360 даёт доступ к Telemost API.
2. Если да — что нужно дополнительно включить в админке организации,
   чтобы перестало возвращаться ApiRestrictedToOrganizations?
3. Если нет — какой минимальный тариф нужен и как его подключить?
```

### 5. Если документация выявит расхождение в коде
Если окажется, что нужен другой endpoint / другой формат авторизации / другой scope — исправить `telemost-create-conference/index.ts` соответствующим образом и переразвернуть. Это будет небольшая правка одного файла.

### Файлы, которых коснёмся
- `src/pages/Login.tsx` — убрать кнопку Яндекс ID.
- `src/pages/RegisterOrganization.tsx` — убрать кнопку Яндекс ID.
- `supabase/functions/telemost-create-conference/index.ts` — возможные правки после чтения доков; гарантированно — добавить в ответ `request_id` Яндекса, чтобы он попадал и в логи, и в UI ошибки.
- (опционально) UI ошибки создания вебинара — показать `request_id`, чтобы вы могли скопировать его в обращение в поддержку.

### Что не трогаем
- Таблицы `yandex_identities`, `yandex_oauth_nonces`.
- Edge-функции `yandex-oauth-*`.
- Страницу `/auth/yandex/callback`.
- Секреты Яндекс OAuth.

Всё это остаётся, просто временно не вызывается из UI.
