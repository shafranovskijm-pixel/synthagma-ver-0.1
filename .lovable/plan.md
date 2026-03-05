

## Диагностика

Из auth-логов видно, что за 1-2 секунды после входа `svetlana-voa@mail.ru` происходит **20+ одновременных refresh_token запросов**, каждый из которых отзывает предыдущий токен (`token_revoked`). Это вызывает `429: Request rate limit reached`, после чего сессия становится невалидной и пользователя выбрасывает на /login.

**Корневая причина**: после `signInWithPassword` одновременно происходят:
1. `signIn()` явно вызывает `fetchUserRole()` (делает DB-запрос)
2. `onAuthStateChange(SIGNED_IN)` тоже вызывает `fetchUserRole()` через setTimeout
3. `signIn()` ещё делает `await supabase.from("profiles").select(...)` - ещё один DB-запрос
4. Supabase client с `autoRefreshToken: true` параллельно пытается обновить токен
5. Если открыто несколько вкладок, каждая подхватывает изменение из localStorage и тоже рефрешит

Всё это создаёт каскад конкурентных refresh-запросов.

## План исправления

### 1. Защита signIn от дублирования (`useAuth.tsx`)

- Добавить флаг `signInInProgress` (ref), при котором `onAuthStateChange` **полностью пропускает** вызов `fetchUserRole` (signIn уже сам его вызывает)
- Убрать `await` с запроса `profiles` и `student_login_history` в signIn - сделать полностью fire-and-forget, чтобы не держать auth-окно открытым
- Использовать кэш роли из `localStorage` как мгновенный fallback при инициализации, чтобы не ждать сетевого запроса

### 2. Агрессивный debounce в onAuthStateChange

- Увеличить debounce с 2 секунд до 5 секунд для **всех** событий кроме SIGNED_OUT
- Полностью игнорировать TOKEN_REFRESHED события (не вызывать fetchUserRole)

### 3. Результат

- signIn: `signInWithPassword` → `fetchUserRole` → return (без лишних запросов)
- onAuthStateChange: не дублирует fetchUserRole если signIn уже в процессе
- Кэш роли из localStorage: мгновенный redirect без ожидания сети

Изменяется один файл: `src/hooks/useAuth.tsx`

