# Кабинет компании — Реализовано

## Этап 1 ✅
- Роль `company` в enum
- Таблица companies расширена (user_id, login_email, generated_password)
- Edge-функция create-company-user
- RLS-политики для роли company
- CompanyDashboard + useCompanyDashboard
- Авторизация и маршрутизация
- Вкладка «Доступ» в карточке компании

## Этап 2 ✅
- Таблица training_plans + RLS
- RLS для course_reminders (company)
- Боковое меню в кабинете (Главная, Сотрудники, Планирование, Документы, Напоминания)
- TrainingPlansTab — CRUD планов обучения с цветовой индикацией
- CompanyDocumentsTab — read-only просмотр договоров/счетов/актов
- CompanyRemindersTab — напоминания о переобучении
- EmployeeImportDialog — массовый импорт из Excel/CSV
- CompanyStatsCards — вынесены в отдельный компонент
- CompanyEmployeesTab — вынесены в отдельный компонент

## Следующие этапы (не реализовано)
- Автоматическое обновление статуса training_plans при зачислении/завершении курса (триггер БД)
- Онбординг/обучение при первом входе в кабинет
