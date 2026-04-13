

# Курс — полноценная страница вместо popup

## Суть
Сейчас при клике на курс открывается Dialog (popup). Нужно превратить его в полноценную страницу `/organization/course/:courseId` с такой же шапкой (top bar + hero banner) и подвалом, как на странице «Документы».

## Что будет сделано

### 1. Новая страница `OrganizationCourseDetails.tsx`
Полноценная страница с layout идентичным `OrganizationDocuments.tsx`:
- **Top bar**: логотип, название орг-и, кнопка «Назад», тариф badge, профиль-аватар
- **Hero banner**: обложка организации с градиентом, логотип и название
- **Контент**: вся текущая логика из `CourseDetailsModal` (статистика, табы: Ученики, Материалы, История, Тесты, Страница курса, Настройки, Напоминания, Группы) — но уже не в Dialog, а на странице
- **Footer**: `OrgDashboardFooter`

### 2. Новый маршрут в `App.tsx`
```
/organization/course/:courseId
```
Обёрнут в `ProtectedRoute` с ролью `organization` и `OrgDashboardProvider`.

### 3. Изменить навигацию — вместо popup открывать страницу
В `TabContentRenderer.tsx` и `DialogsContainer.tsx`: при клике на курс вместо `setShowCourseDetailsModal(true)` делать `navigate(/organization/course/${course.id})`.

### 4. Убрать Dialog-обёртку из `CourseDetailsModal.tsx`
Извлечь содержимое (статистику, табы, всю логику) в отдельный компонент `CourseDetailsContent.tsx`, который используется на новой странице. Старый `CourseDetailsModal` можно оставить как обёртку или удалить.

## Файлы

| Файл | Изменение |
|---|---|
| `src/pages/OrganizationCourseDetails.tsx` | Новая страница: top bar + hero + контент курса + footer |
| `src/components/organization/CourseDetailsContent.tsx` | Новый: вся логика из CourseDetailsModal без Dialog-обёртки |
| `src/App.tsx` | Добавить route `/organization/course/:courseId` |
| `src/components/organization/tabs/TabContentRenderer.tsx` | navigate вместо открытия модала |
| `src/components/organization/dialogs/DialogsContainer.tsx` | Убрать CourseDetailsModal (больше не нужен как popup) |

