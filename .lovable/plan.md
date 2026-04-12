

# Добавить вкладку «Страница курса» (лендинг) в модалку курса

## Что будет сделано

Добавить новую вкладку **«Страница курса»** (с иконкой Globe) в `CourseDetailsModal` — между «Тесты» и «Настройки». При клике на неё внутри модалки откроется встроенный редактор лендинга курса (тот же `CourseLandingEditor`, но адаптированный для работы внутри модалки).

## Изменения

### 1. `src/hooks/useCourseDetailsModal.ts`
- Добавить `"landing"` в тип `CourseDetailsTabType`

### 2. `src/components/organization/dialogs/CourseDetailsModal.tsx`
- Обновить тип `activeTab` / `onTabChange` — добавить `"landing"`
- Добавить `TabsTrigger` с иконкой `Globe` и текстом «Страница курса» после «Тесты»
- Добавить `TabsContent value="landing"` — внутри него встроить компонент лендинг-редактора
- Создать обёртку, которая передаёт `courseId` в редактор без навигации (без `useParams`)

### 3. `src/pages/CourseLandingEditor.tsx` (рефакторинг)
- Вынести основную логику редактора в отдельный компонент `CourseLandingEditorContent` который принимает `courseId` как проп (вместо `useParams`)
- Экспортировать `CourseLandingEditorContent` для использования в модалке
- Оставить default export `CourseLandingEditor` как обёртку с `useParams` для роута `/course/:courseId/landing-editor`
- Убрать/скрыть кнопку «Назад» при использовании внутри модалки (проп `embedded?: boolean`)

### Результат
Редактор лендинга доступен прямо из вкладки курса, без перехода на отдельную страницу. Все секции (Hero, Аудитория, Преподаватели, FAQ и т.д.) редактируются inline в модалке.

