

## Plan: Organization Profile Page + Notification Settings

### What we're building
A dedicated profile page for organization users at `/organization/profile`, matching the SkillSpace design from the reference images. The header dropdown "Профиль" will navigate to this new page instead of the Settings tab.

### Page structure — 3 tabs

**Tab 1: Мой профиль**
- Left card: Profile settings (Email, Avatar upload, Full Name, Phone with flag, Social links VK/Telegram, Bio textarea, Save button)
- Right column: "Изменить email" card (email input + save), "Смена пароля" card (new password + confirm + change button)

**Tab 2: Настройки уведомлений**
- Sound toggle (Звук уведомлений — Выкл/Вкл dropdown)
- Table grid: rows = notification types, columns = Платформа, Браузер, Email, Телеграм, Приложение
- Notification types: Закончились места в группе, Ученик завершил курс, Напоминание о вебинаре, Уведомления по домашним заданиям, Изменения и транзакции партнёра, Истёк промокод, Ученик ждёт ответа 24ч, Ученик оплатил курс
- Telegram and Приложение columns shown but disabled (greyed out, coming soon)
- Uses existing `notification_preferences` table

**Tab 3: Партнёрская программа**
- Link to partner dashboard or embed partner info

### Changes

| File | What |
|------|------|
| `src/pages/OrganizationProfile.tsx` | **New** — Full profile page with 3 tabs, SkillSpace-style layout |
| `src/App.tsx` | Add route `/organization/profile` with ProtectedRoute |
| `src/components/organization/OrgDashboardHeader.tsx` | Change "Профиль" dropdown item to `navigate("/organization/profile")` |

### Profile data
- Read/update from `profiles` table (full_name, phone, avatar_url, etc.)
- Add `vk_link`, `telegram_link`, `bio` columns to profiles if missing
- Email change via `supabase.auth.updateUser({ email })`
- Password change via `supabase.auth.updateUser({ password })`

### Database migration (if needed)
- Add `vk_link text`, `telegram_link text`, `bio text` to `profiles` table (check if they already exist first)

### No changes to student notification settings
The existing student profile notification settings remain separate. This is for the organization user's own notification preferences.

