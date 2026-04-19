
## План: Авторизация через Яндекс ID

### Что нужно сделать
Добавить вход/регистрацию через Яндекс ID (OAuth) для трёх сценариев:
1. **Ученик** заходит под выданным логином → может привязать Яндекс к текущему аккаунту → дальше входит одной кнопкой.
2. **Организация** регистрируется через Яндекс → обязательно вводит ИНН → создаётся организация и профиль.
3. **Компания-клиент** заходит через Яндекс по тому же принципу.

### Почему кастомный OAuth, а не встроенный
Lovable Cloud / Supabase нативно поддерживает Google, Apple, Phone, Email — Яндекс **не входит** в список нативных провайдеров. Поэтому реализуем кастомный OAuth-флоу через свои edge-функции, используя ваши `client_id` / `client_secret` (на скрине).

### Архитектура

```text
[Кнопка "Войти через Яндекс"]
        │
        ▼
[edge: yandex-oauth-start] ──► redirect на oauth.yandex.ru
        │
        ▼
[Яндекс] ──► redirect на /auth/yandex/callback?code=...
        │
        ▼
[edge: yandex-oauth-callback]
   1. code → access_token (login:info)
   2. token → данные пользователя (id, email, ФИО)
   3. ветвление по state:
      - link    → привязать к текущему user_id
      - login   → найти по yandex_id → создать сессию
      - signup-org → требовать ИНН → создать org + profile
        │
        ▼
[Возврат в приложение с сессией Supabase]
```

### Изменения в БД (миграция)
- Таблица `yandex_identities`: `user_id`, `yandex_id` (uniq), `yandex_email`, `yandex_login`, `linked_at`. RLS: пользователь видит только свою связь.
- Поле `inn` в `organizations` уже есть (проверить); если нет — добавить.

### Edge-функции (новые, `verify_jwt = false` для callback)
1. `yandex-oauth-start` — формирует URL `https://oauth.yandex.ru/authorize?response_type=code&client_id=...&state=...&redirect_uri=...`. Параметр `state` шифрует: режим (`link` / `login` / `signup-org`) + текущий `user_id` (если есть) + nonce.
2. `yandex-oauth-callback` — обменивает `code` на токен, тянет `https://login.yandex.ru/info`, выполняет один из сценариев:
   - **link**: вставка в `yandex_identities` под текущим `user_id`.
   - **login**: ищем `yandex_identities.yandex_id` → если есть, создаём magic-link / одноразовую сессию через Admin API (`generateLink` type=magiclink) и редиректим. Если нет — редирект на страницу «Аккаунт не найден, привяжите вручную».
   - **signup-org**: если ИНН ещё не передан — редирект на `/auth/yandex/complete?token=...` (форма ИНН). После сабмита — создаём `auth.user`, `profiles`, `organizations`, `user_roles=organization`, пишем `yandex_identities`.

### Секреты
- `YANDEX_OAUTH_CLIENT_ID` = `2215ed57e51341d2bbeb0389e7eb7df8`
- `YANDEX_OAUTH_CLIENT_SECRET` = `78f00ae93c9b45c29011142d7e602cd6`
- `YANDEX_OAUTH_STATE_SECRET` = случайная строка для подписи state (HMAC).

Запрошу через `add_secret` после одобрения.

### Frontend
- Кнопка «Войти через Яндекс» на `/auth` (login + signup табы) и на странице регистрации организации.
- В кабинете ученика/организации — раздел «Привязанные аккаунты» с кнопкой «Привязать Яндекс ID» и статусом (привязан + email).
- Новая страница `/auth/yandex/callback` — принимает результат (success/нужен ИНН/ошибка), показывает форму ИНН при необходимости, потом дергает Supabase для установки сессии по присланному magic link.
- Отдельная страница `/auth/yandex/complete-org` — форма ИНН + название организации (с DaData lookup, как уже используется).

### Настройка в Яндексе (что вам сделать руками)
В кабинете приложения Яндекс OAuth добавить Redirect URI:
- `https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/yandex-oauth-callback`

### Безопасность
- `state` подписан HMAC, TTL 10 мин, одноразовый (храним nonce в таблице `yandex_oauth_nonces`).
- ИНН валидируется (10/12 цифр, контрольная сумма).
- Привязка возможна только если `yandex_id` ещё ни к кому не привязан (uniq + явная проверка).
- `client_secret` только в edge-функции, никогда на фронте.

### Файлы, которые будут затронуты
- Новые: `supabase/functions/yandex-oauth-start/index.ts`, `supabase/functions/yandex-oauth-callback/index.ts`, миграция БД, `src/pages/auth/YandexCallback.tsx`, `src/pages/auth/YandexCompleteOrg.tsx`, `src/components/auth/YandexLoginButton.tsx`, `src/components/profile/LinkedAccounts.tsx`.
- Правки: `src/pages/Auth.tsx` (или текущая страница входа), маршруты в `src/App.tsx`, `supabase/config.toml` (verify_jwt=false для двух функций), `manage-secret` whitelist.

### Открытый вопрос
Если Яндекс-аккаунт уже привязан к другому пользователю и кто-то ещё пытается «войти через Яндекс» с него — что делать: блокировать со ссылкой на поддержку, или предлагать «выйти из старого и привязать сюда»? По умолчанию сделаю **блокировку с понятным сообщением**, как безопасный вариант.
