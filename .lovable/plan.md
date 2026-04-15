

# Исправление сборки + открытие редактора курсов в текущем окне

## Проблема 1: Ошибка сборки (критическая)

При массовой замене Loader2 → SigmaSpinner скрипт вставил `import { SigmaSpinner }` внутрь существующих многострочных import-блоков в **14 файлах**, сломав синтаксис.

### Файлы с битыми импортами:
1. `src/pages/Login.tsx` (строка 16)
2. `src/pages/CourseEditor.tsx` (строка 48)
3. `src/components/admin/AdminMarketplaceManager.tsx` (строка 43)
4. `src/components/course-builder/TestAnswersDialog.tsx` (строка 11)
5. `src/components/organization/AchievementsManager.tsx` (строка 10)
6. `src/components/organization/BulkFRDOExport.tsx` (строка 21)
7. `src/components/organization/EnrollmentHistory.tsx` (строка 20)
8. `src/components/organization/FRDOExportDialog.tsx` (строка 32)
9. `src/components/organization/OrgChatsTab.tsx` (строка 15)
10. `src/components/organization/OrgDashboardHeader.tsx` (строка 17)
11. `src/components/organization/OrgNotifications.tsx` (строка 17)
12. `src/components/organization/ProfileBrandingTab.tsx` (строка 12)
13. `src/components/student/AvailablePaidCourses.tsx` (строка 9)
14. `src/components/student/StudentDocumentsUpload.tsx` (строка 9)

**Действие:** В каждом файле удалить строку `import { SigmaSpinner }...` из середины другого import-блока и перенести её на отдельную строку после закрывающего import-блока. Автоматизируется скриптом.

---

## Проблема 2: Редактор курсов в том же окне

Сейчас кнопка «Редактировать» делает `navigate(/course-builder/...)`, что открывает отдельную страницу. Пользователь хочет, чтобы редактор открывался в рамках текущей карточки курса.

**Подход:** Добавить новую вкладку `"editor"` в боковое меню `CourseDetailsContent`, которая встраивает компонент `CourseBuilder` (из `src/pages/CourseBuilder.tsx`) прямо внутри панели контента. Кнопка «Редактировать» вместо навигации будет переключать на эту вкладку.

### Изменения:
1. **`src/components/organization/CourseDetailsContent.tsx`:**
   - Добавить `"editor"` в тип `activeTab`
   - Добавить пункт «Редактор» (иконка `Edit`) в сайдбар-меню, секция «Настройки»
   - Кнопка «Редактировать» → `onTabChange("editor")` вместо `navigate`
   - В content panel при `activeTab === "editor"` рендерить `<CourseBuilder courseId={course.id} embedded />`

2. **`src/pages/CourseBuilder.tsx`:**
   - Добавить prop `embedded?: boolean` и `courseId?: string`
   - Если `embedded` — не рендерить шапку с навигацией (кнопка «Назад», логотип), убрать внешние отступы
   - Использовать переданный `courseId` вместо `useParams`

### Технические детали

Тип таба расширяется:
```text
activeTab: "students" | "materials" | ... | "editor"
```

Курс-билдер получает два режима работы:
```text
<CourseBuilder />               — полноэкранная страница (как сейчас)
<CourseBuilder embedded courseId="..." />  — встроенный режим без шапки
```

## Файлы

| Файл | Действие |
|---|---|
| 14 файлов с битыми импортами | Починить расположение import SigmaSpinner |
| `src/components/organization/CourseDetailsContent.tsx` | Добавить вкладку «Редактор», изменить кнопку |
| `src/pages/CourseBuilder.tsx` | Добавить embedded-режим |

