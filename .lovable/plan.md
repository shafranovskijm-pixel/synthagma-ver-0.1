
## Что делаем

Две большие задачи в редакторе курса (`/organization/course-editor/:courseId`):

### 1. Закреплённое меню уроков слева (sticky lessons sidebar)

Сейчас на странице редактора курса (`OrganizationCourseEditor` / `useCourseEditor`) уроки отображаются в основном потоке страницы — при 30+ уроках перемещение между ними неудобно (нужно скроллить туда-сюда).

Что сделаем:
- Добавить **левую закреплённую боковую панель** (sticky) внутри страницы редактора курса (НЕ глобальный сайдбар организации — этот остаётся слева как сейчас, а наша панель встроится справа от него, перед основной рабочей областью).
- В панели — список всех уроков (drag-and-drop, как сейчас в основной области), плюс кнопка «+ Добавить урок» закреплена сверху.
- Клик по уроку — плавный скролл к этому уроку в основной области + раскрытие его аккордеона.
- Активный урок (тот, который сейчас в зоне видимости через `IntersectionObserver`) подсвечивается.
- Поддержка drag-and-drop переупорядочивания прямо в панели (используем тот же `handleDragEnd` из `useCourseEditor`).
- На мобильном — панель скрыта, доступна через кнопку «☰ Уроки» (Sheet).
- Стиль: как у `CourseSidebarContent` (см. `src/components/course-learning/CourseSidebar.tsx`) — единый визуальный язык; следуем правилу `mem://style/sidebar-visual-standard` (shadow + fill, без `backdrop-blur-sm`).

### 2. Фоновая загрузка видео + уведомление

Сейчас загрузка видео в `useLessonMedia.handleVideoUpload` / `handleKinescopeUpload` живёт **внутри открытого `LessonEditor`** — если закрыть диалог или уйти на другой урок, прогресс теряется (или загрузка прерывается).

Что сделаем:
- Создать **глобальный контекст загрузок** `BackgroundUploadsContext` (provider в корне приложения), который держит список активных загрузок: `{ id, lessonId, courseId, courseTitle, lessonTitle, progress, status, abort }`.
- При старте загрузки в `useLessonMedia` — регистрировать задачу в этом контексте; прогресс/статус обновлять туда же.
- Загрузка продолжается **независимо от открытого диалога урока** — `LessonEditor` можно закрыть, перейти на другой урок, на другой курс — TUS-загрузка продолжается в фоне (`AbortController` живёт в контексте, не в компоненте).
- Маленький **floating toast-плашка слева внизу** (`BackgroundUploadsTray`) — показывает все активные загрузки с прогрессом и кнопкой отмены. Сворачивается / разворачивается.
- По завершении:
  - Toast (sonner) «Видео загружено: {lessonTitle} ({courseTitle})».
  - Запись в **уведомления** (`org_notifications` — см. `mem://features/organization/order-notifications`), новый тип `'upload_complete'` — чтобы появлялось в шапке.
  - **Звук** — короткий «брякающий» звуковой эффект (Web Audio API, генерируем синтетически — без файла) на 200мс. Уважаем `prefers-reduced-motion` и опционально мьют через localStorage.
- При ошибке загрузки — тоже toast + уведомление со статусом «failed», с кнопкой «Повторить».
- Защита от закрытия страницы во время загрузки: `beforeunload` warning.

## Технические детали

### Файлы / изменения

**Новые:**
- `src/components/course-editor/CourseLessonsSidebar.tsx` — закреплённая панель уроков.
- `src/contexts/BackgroundUploadsContext.tsx` — глобальный контекст активных загрузок.
- `src/components/uploads/BackgroundUploadsTray.tsx` — плавающая UI-плашка с прогрессом.
- `src/utils/uploadSound.ts` — Web Audio синтез короткого «дзинь».

**Правки:**
- `src/pages/OrganizationCourseEditor.tsx` (или эквивалентная страница, где рендерится редактор) — добавить layout `[OrgSidebar | CourseLessonsSidebar | MainContent]`; передавать в `CourseLessonsSidebar` уроки + dnd-обработчики из `useCourseEditor`.
- `src/hooks/useCourseEditor.ts` — добавить `activeLessonId` (через IntersectionObserver или ref) и метод `scrollToLesson(id)`.
- `src/hooks/useLessonMedia.ts` — заменить локальный state прогресса на регистрацию задачи в `BackgroundUploadsContext`; не отменять при размонтировании.
- `src/App.tsx` — обернуть в `<BackgroundUploadsProvider>`, добавить `<BackgroundUploadsTray />`.
- SQL-миграция (если нужно): расширить `org_notifications.type` enum значением `'upload_complete'` (если поле строковое — миграция не нужна).

### Поведение sticky-сайдбара

```
┌─────────────────────────────────────────────────────────────┐
│ OrgSidebar │ Lessons sidebar       │ Main editor area       │
│ (gloabl)   │ (sticky, top-20)      │ (scrollable)           │
│            │ ┌───────────────────┐ │ ┌────────────────────┐ │
│            │ │ + Добавить урок   │ │ │ Информация о курсе │ │
│            │ ├───────────────────┤ │ ├────────────────────┤ │
│            │ │ 1. Знакомство  •  │ │ │ Урок 1 ...         │ │
│            │ │ 2. Тест 1         │ │ │ Урок 2 ...         │ │
│            │ │ 3. Видео 1        │ │ │ ...                │ │
│            │ │ ... (scrollable)  │ │ │                    │ │
│            │ └───────────────────┘ │ └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Поведение фоновой загрузки

```
1. Юзер кликает «Загрузить видео» в уроке A
2. useLessonMedia → BackgroundUploadsContext.start({lessonId, ...})
3. TUS-цикл крутится в контексте (не в компоненте)
4. Юзер закрывает диалог → переходит на урок B → загрузка идёт
5. По finalize:
   - patch lesson в БД (как сейчас)
   - toast.success
   - playUploadCompleteSound()
   - insert into org_notifications
6. Tray показывает «✓ Видео загружено» 5 сек, потом исчезает
```

## Этапы

1. Создать `CourseLessonsSidebar` + интегрировать в страницу редактора, проверить sticky + dnd + smooth scroll.
2. Добавить `IntersectionObserver` для подсветки активного урока.
3. Создать `BackgroundUploadsContext` + `BackgroundUploadsTray`.
4. Перенести TUS-цикл из `useLessonMedia` в контекст; оставить в хуке только триггер `start()`.
5. Добавить звук + запись в `org_notifications` по завершении.
6. `beforeunload` warning при активных загрузках.
7. End-to-end проверка:
   - Открыть курс с 20+ уроками → панель слева видна → клик по уроку 18 скроллит к нему;
   - Перетащить урок в панели → порядок меняется и в основной области;
   - Запустить загрузку видео → закрыть диалог → перейти на другой урок → tray показывает прогресс → по окончании toast + звук + уведомление в шапке;
   - Попытка закрыть вкладку во время загрузки → браузер предупреждает.
