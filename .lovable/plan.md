
# Улучшение интерфейса админ-панели

## Обзор изменений

### 1. Таблица организаций -- убрать столбец "Создана" и уплотнить
- Удалить столбец "Создана" из таблицы (дата останется доступна в карточке организации при клике)
- Объединить столбцы "Сотрудники" и "Курсы" в один компактный столбец с бейджами
- Это уберёт горизонтальный скролл

### 2. Убрать "Функции системы" из сайдбара
- Удалить пункт "Функции системы" из `AdminSidebar.tsx`
- Удалить тип `"features"` из `AdminTabType`
- Убрать рендеринг `SystemFeaturesManager` из `AdminDashboard.tsx`

### 3. Аналитику переместить вниз в сайдбаре
- Переместить кнопку "Аналитика" вниз в навигации, после "Отзывы" и перед "Настройки"
- По умолчанию открывать вкладку "Организации" вместо "Аналитика"

### 4. Карта разработчика с БД в Настройках
В `AdminSettings.tsx` добавить новый раздел "Карта базы данных" с интерактивной визуализацией:
- Группировка 65 таблиц по доменам (Организации, Курсы, Студенты, Документы, Система и т.д.)
- Для каждой таблицы: название, количество записей, связи с другими таблицами
- Связи показаны стрелками/линиями между группами
- Визуально: карточки-группы с таблицами внутри, цветовая кодировка по доменам

Группировка таблиц:

```text
Организации (8 таблиц):
  organizations, organization_credentials, organization_comments,
  organization_features, organization_feature_categories,
  organization_feature_usage, organization_offer_acceptances, 
  organization_reminders

Пользователи (4):
  profiles, user_roles, user_achievements, achievements

Курсы и обучение (10):
  courses, lessons, test_questions, course_categories,
  enrollments, enrollment_history, lesson_progress, 
  test_attempts, course_reminders, course_documents

Компании (3):
  companies, company_documents, registration_links

Документооборот (8):
  student_documents, org_documents, consent_documents,
  student_identity_documents, student_frdo_data,
  document_issuance_log, education_document_records, student_consents

Журналы (3):
  journal_instances, journal_entries, audit_logs

Библиотека (2):
  library_folders, library_documents

Охрана труда (3):
  labor_safety_groups, labor_safety_records, labor_safety_profiles

Маркетплейс (4):
  marketplace_courses, marketplace_orders, course_requests, service_orders

Система (8):
  system_settings, system_features, system_feature_categories,
  system_patches, system_diagnostics, promo_codes, landing_content,
  blog_posts

Прочее (5):
  newsletter_subscribers, testimonials, chat_messages,
  video_identifications, program_categories, program_documents, 
  program_folders, student_groups, organization_usage, plan_requests
```

Для каждой группы показывается:
- Иконка и цвет
- Список таблиц с количеством записей (загружается динамически)
- Стрелки-связи между группами (например, "Курсы" связаны с "Организации" и "Студенты")

---

## Технические детали

| Файл | Изменения |
|---|---|
| `src/components/admin/AdminSidebar.tsx` | Убрать "Функции системы", переместить "Аналитика" вниз |
| `src/pages/AdminDashboard.tsx` | Убрать рендер `SystemFeaturesManager`, сменить дефолтную вкладку на `organizations` |
| `src/components/admin/OrganizationsManager.tsx` | Удалить столбец "Создана", объединить "Сотрудники"/"Курсы" |
| `src/components/admin/AdminSettings.tsx` | Добавить раздел "Карта базы данных" с группированной визуализацией таблиц и связей |
