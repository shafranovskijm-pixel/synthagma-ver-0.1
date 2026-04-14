

# Редизайн панели администратора — по образцу кабинета организации

## Что делаем

Панель администратора (`/admin`) получает тот же уровень дизайна, что и кабинет организации:
- **Hero-баннер** с обложкой (загрузка, генерация ИИ, позиционирование)
- **Топ-бар** с логотипом, уведомлениями и профильным меню (Профиль, Настройки, Сотрудники, Документооборот, Что нового, Помощь, Выход)
- **Подвал** аналогичный `OrgDashboardFooter`
- **Раздел «Сотрудники»** в настройках — регистрация менеджеров по продажам и других админов с разными уровнями доступа

## Этапы

### 1. Миграция БД — брендинг админки и таблица admin_staff

Добавить таблицу `admin_branding`:
- `id UUID PK`, `cover_url TEXT`, `logo_url TEXT`, `branding JSONB DEFAULT '{}'` (customName, customSubtitle, coverPosition)

Создать таблицу `admin_staff`:
- `id UUID PK`, `user_id UUID REFERENCES auth.users(id)`, `role TEXT` (super_admin, admin, sales_manager, viewer), `full_name TEXT`, `email TEXT`, `created_at TIMESTAMPTZ`
- RLS: доступ только для пользователей с ролью admin

### 2. `AdminDashboardHeader.tsx` — по образцу OrgDashboardHeader

- Топ-бар: логотип + «СИНТАГМА Администратор» слева, справа — уведомления (существующий Popover) + аватар с DropdownMenu
- DropdownMenu пункты: Профиль, Настройки, Сотрудники, Документооборот, Что нового?, Помощь, Выход
- Hero-баннер с обложкой (загрузка/смена/генерация ИИ)
- Под баннером — название текущей вкладки

### 3. `AdminDashboardFooter.tsx`

Аналог `OrgDashboardFooter` — логотип, ссылки на платформу, документы, копирайт.

### 4. Вкладка «Сотрудники» в AdminSettings или отдельный таб

- Таблица сотрудников (ФИО, email, роль, дата)
- Добавление/удаление/смена роли
- Роли: Супер-админ, Админ, Менеджер по продажам, Наблюдатель — с описанием прав

### 5. `useAdminBranding.ts`

Загрузка/сохранение обложки и логотипа в Storage, обновление `admin_branding`.

### 6. Рефакторинг `AdminDashboard.tsx`

- Заменить inline header на `AdminDashboardHeader`
- Добавить `AdminDashboardFooter`
- Подключить таб «staff» в сайдбар
- Макет: flex flex-col с header, content, footer

## Файлы

| Действие | Файл |
|---|---|
| Миграция | Таблицы `admin_branding` + `admin_staff` с RLS |
| Создать | `src/components/admin/AdminDashboardHeader.tsx` |
| Создать | `src/components/admin/AdminDashboardFooter.tsx` |
| Создать | `src/components/admin/AdminStaffTab.tsx` |
| Создать | `src/hooks/useAdminBranding.ts` |
| Изменить | `src/pages/AdminDashboard.tsx` — новый макет |
| Изменить | `src/components/admin/AdminSidebar.tsx` — добавить таб «Сотрудники» |

