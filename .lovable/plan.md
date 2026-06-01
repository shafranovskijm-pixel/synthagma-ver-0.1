# Восстановление входа

## Что сломалось

В `src/hooks/useAuth.tsx` я обернул `supabase.auth.signInWithPassword` в `withAuthTimeout(...)`. Эта обёртка через `Promise.race` бросает `new Error('AUTH_TIMEOUT')` при таймауте и пробрасывает любое исключение от fetch (например, `Failed to fetch` от прокси-фолбэка).

Старая логика `signIn` всегда **возвращала** `{ error }` и никогда не бросала. `handleSubmit` в `Login.tsx` это допущение использует — у него нет `try/catch`, и после исключения `setIsLoading(false)` не вызывается. Отсюда бесконечная «Вход...».

Плюс лишняя кнопка «Обновить интерфейс и канал» внизу формы — пользователю не нужна.

## Правки

### 1) `src/hooks/useAuth.tsx`
- Удалить `withAuthTimeout` и константу `AUTH_REQUEST_TIMEOUT_MS`.
- В `signIn` вызывать `supabase.auth.signInWithPassword({ email, password })` напрямую, как раньше. Возвращать `{ error }` — никаких бросков.
- Остальную логику (`signInInProgress`, обновление session/user, `fetchUserRole`, лог логина) оставить без изменений.

### 2) `src/pages/Login.tsx`
- Удалить кнопку «Обновить интерфейс и канал» (`handleRefreshChannel`, JSX-блок с `<RefreshCw/>`).
- Удалить импорты, которые больше не используются: `RefreshCw`, `forceClientRefresh`, `resetProxyChannel`.
- Ссылку «Не загружается?» и весь остальной UI оставить как есть.

### 3) `src/utils/handleSupabaseError.ts`
- Оставить как есть. Маппинг HTML/522 → «Сервис временно недоступен» полезен и в `handleSubmit` уже срабатывает, если Supabase вернёт ошибку.

### 4) `src/utils/proxyFetch.ts`
- Оставить как есть. Логика автопереключения direct↔proxy и обработка 522/HTML корректна и не является причиной зависания.

## Ожидаемый результат
- Кнопка «Войти» больше не висит вечно: при ошибке показывается toast и снова активна.
- Поведение входа идентично «как раньше» (до правок с таймаутом).
- Лишней кнопки «Обновить канал» под формой нет.
