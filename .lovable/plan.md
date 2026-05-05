## Что сделать

**1. `src/pages/DemoStudentLogin.tsx`** — перед `supabase.auth.signOut()` сохранить текущую сессию в `localStorage.demoStudentReturn`:
```json
{ "access_token": "...", "refresh_token": "...", "returnPath": "/organization" }
```
`returnPath` берётся из `document.referrer` (если он того же origin и начинается с `/organization`, `/admin`, `/sales`, `/company`), иначе `/organization`.

**2. `src/pages/StudentDashboard.tsx`** — добавить флаг `isDemoStudent` (синхронно из `localStorage.getItem('demoStudentReturn')`). Если он true и не `isAdminView` — отрисовать фиксированную плашку сверху (стиль как у admin-bar) с двумя кнопками:

- **«Назад в организацию»** — читает сохранённые токены, вызывает `supabase.auth.setSession({ access_token, refresh_token })`, удаляет ключ и `navigate(returnPath, { replace: true })`. Fallback при ошибке: `navigate('/auth')`.
- **«Выйти»** — `supabase.auth.signOut()` + удалить ключ + `navigate('/auth')`.

Также учесть `isDemoStudent` в условии `md:mt-10` для основного контента, чтобы плашка не перекрывала контент.

## Почему так
- Refresh-token валиден — `setSession` бесшовно вернёт пользователя организации без повторного ввода пароля.
- Хранение токенов в `localStorage` безопасно: Supabase SDK по умолчанию хранит их там же.
- Edge-функцию `demo-student-login` менять не нужно.
