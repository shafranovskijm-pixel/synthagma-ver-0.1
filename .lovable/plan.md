

# Система заданий (домашних работ) и управление сотрудниками

## Что будет сделано

### 1. Таблица `org_staff` -- сотрудники организации с ролями
Роли как в SkillSpace: Владелец, Администратор, Редактор школы, Редактор курсов, Преподаватель.

```text
org_staff
├── id (uuid, PK)
├── organization_id (uuid, FK → organizations)
├── user_id (uuid, FK → auth.users)
├── role (text: owner / admin / school_editor / course_editor / teacher)
├── display_name (text)
├── bio (text, nullable)
├── visibility (text: all / course_only / hidden)
├── sections_access (jsonb) -- список доступных разделов
├── created_at, updated_at
```

### 2. Таблица `homework_submissions` -- ответы учеников на задания
```text
homework_submissions
├── id (uuid, PK)
├── lesson_id (uuid, FK → lessons)
├── student_id (uuid, FK → auth.users)
├── course_id (uuid, FK → courses)
├── organization_id (uuid)
├── content (text) -- текст ответа (rich text)
├── attachments (jsonb) -- [{url, name, type}]
├── status (text: pending / revision / approved / rejected)
├── score (integer, nullable)
├── reviewer_id (uuid, nullable, FK → auth.users)
├── reviewer_comment (text, nullable)
├── submitted_at, reviewed_at, created_at
```

### 3. Тип урока `homework` в конструкторе курсов
- Добавить `homework` в SortableLessonItem как новый тип урока
- В конструкторе: настройка текста задания (описание что нужно сделать), возможность прикреплять файлы-образцы
- В CourseLearning: отображение задания + форма ответа (текстовое поле с rich-editor + прикрепление файлов) + история ответов

### 4. Вкладка «Проверка заданий» в оргдашборде
- Новый пункт в сайдбаре: иконка ClipboardCheck, бейдж с количеством непроверенных
- Таблица: Имя, Email, Задание, Курс, Последний ответ, Статус
- Фильтры: Ждёт проверки / На доработке / Выполнено / Незачёт
- Модалка проверки: просмотр задания + ответ ученика + комментарий + выбор статуса (Выполнено / На доработку / Незачёт) + балл

### 5. Раздел «Сотрудники» в настройках
- Новая секция в SettingsTab с переходом на подстраницу `staff`
- Таблица ролей: роль, доступ к разделам, количество сотрудников
- Диалог добавления сотрудника: email, имя, видимость в чатах (Все ученики / Только ученики его курсов / Скрыт), выбор роли
- Возможность создать новую роль с настройкой доступа к разделам

## Технические детали

### БД миграции:
1. Создать таблицу `org_staff` с RLS (только пользователи своей организации)
2. Создать таблицу `homework_submissions` с RLS
3. Добавить `homework` как допустимый тип в lessons

### Файлы для создания/изменения:
- **Новые компоненты:**
  - `src/components/organization/StaffManager.tsx` -- управление сотрудниками и ролями
  - `src/components/organization/HomeworkReviewTab.tsx` -- вкладка проверки заданий
  - `src/components/organization/HomeworkReviewDialog.tsx` -- модалка проверки конкретного задания
  - `src/components/course-learning/HomeworkSubmission.tsx` -- форма ответа ученика

- **Изменения:**
  - `src/components/organization/OrgSidebar.tsx` -- добавить пункт «Проверка заданий» + `staff` tab
  - `src/components/organization/tabs/TabContentRenderer.tsx` -- рендер новых вкладок
  - `src/components/organization/tabs/SettingsTab.tsx` -- добавить секцию «Сотрудники»
  - `src/components/course-builder/SortableLessonItem.tsx` -- поддержка типа `homework`
  - `src/pages/CourseLearning.tsx` -- рендеринг урока-задания с формой ответа

### UI проверки задания (модалка):
```text
┌─────────────────────────────────────────────┐
│ Анкета участника  │  Проверка работы        │
│ ⏳ Ждёт проверки   ○ Последний ответ: ...   │
├─────────────────────────────────────────────┤
│ Последний ответ ученика:                    │
│ ┌─────────┐ ┌──────────────────────────┐    │
│ │ Аватар  │ │ Текст ответа ученика     │    │
│ │ Имя     │ │ ...                      │    │
│ │ Дата    │ │                          │    │
│ └─────────┘ └──────────────────────────┘    │
│                                             │
│ Введите ваш ответ:                          │
│ ┌──────────────────────────────────────┐    │
│ │ Rich text editor                     │    │
│ └──────────────────────────────────────┘    │
│ 📎 Прикрепить файлы   ⭐ 0                  │
│                  ✅ Выполнено ▾  [Отправить] │
└─────────────────────────────────────────────┘
```

