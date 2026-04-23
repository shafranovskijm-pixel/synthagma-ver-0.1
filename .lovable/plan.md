

# План: «Войти как ученик» — открывать любой курс и пропускать видеоидентификацию для админа/менеджера

## Корень проблемы

Когда админ или менеджер организации жмёт «Войти как ученик», в `localStorage.adminViewAsStudent` сохраняется `userId` ученика. `useStudentDashboard` это уже учитывает — он подменяет `effectiveUserId = targetUserId` и показывает курсы выбранного ученика. Но дальше — две блокировки:

1. **`src/hooks/course-learning/useCourseLearningFacade.ts` → `fetchCourseData`** запрашивает enrollment по `user!.id` (это **всегда текущий админ**, а не targetUserId). Результат `enrollmentResult.data` пустой → срабатывает `toast.error('Вы не записаны на этот курс') + navigate('/student')`. Админ ни в один курс ученика провалиться не может.
2. **Та же функция, строки 282-291** — проверка видеоидентификации идёт по `user.id` админа. У админа никакой `video_identifications` нет → `navigate('/student')` сразу же.
3. **`src/pages/StudentDashboard.tsx → handleCourseClick`** (строки 292-305) тоже проверяет `isVideoIdentified` — и в режиме админа показывает тост «Требуется видеоидентификация».

При этом `CourseLearning` вообще не знает, что мы в admin-view: он не читает `localStorage.adminViewAsStudent`.

## Что меняется

### 1. Утилита-хелпер `src/utils/adminViewMode.ts` (новый файл)

Один источник правды для всех мест, где нужно понять, что мы в режиме «админ смотрит как ученик»:

```ts
export function getAdminViewData(): { userId: string; name: string; orgReturn?: string } | null
export function isAdminViewActive(): boolean
```

Читает `localStorage.getItem('adminViewAsStudent')`, парсит JSON, возвращает данные. Заменяет 7 разрозненных мест, где это парсится вручную.

### 2. Правка `src/hooks/course-learning/useCourseLearningFacade.ts`

**a)** В начале хука читаем `getAdminViewData()` и определяем `effectiveUserId = adminView?.userId || user?.id`. Все обращения к `user!.id` в `fetchCourseData` (строки 275, 283, 285, 336, 338, 348) меняем на `effectiveUserId`.

**b)** В блоке проверки видеоидентификации (282-291): если `isAdminViewActive()` → пропускаем проверку полностью.

**c)** В блоке отсутствия enrollment (319-323): если `isAdminViewActive()` → **не редиректим**, вместо ошибки показываем toast.info («Просмотр курса в режиме администратора — прогресс не сохраняется») и продолжаем без `enrollmentId`. Уроки и контент всё равно загрузятся.

**d)** Все мутации (`saveLessonTime`, `recalc_enrollment_time`, `lesson_progress.upsert`, `enrollments.update`, `course_access_log.insert`, `test_attempts.insert`) уже завязаны на `enrollmentId` через ранний `return if (!enrollmentId)` — но добавим явную защиту: в начале каждой мутации `if (isAdminViewActive()) return;`. Это гарантия, что админ ничего не запишет от лица ученика по ошибке.

### 3. Правка `src/pages/StudentDashboard.tsx → handleCourseClick`

В проверке видеоидентификации (строки 295-300) добавляем условие: `if (!isAdminView && needsVerification)`. Для админа сразу `navigate(\`/course/${courseId}/learn\`)`.

Также сейчас доступны только курсы, на которые ученик записан (`courses` из `useStudentDashboard`). Этого достаточно для демонстрации — админ увидит реальные курсы выбранного ученика. Если курсов у ученика нет, пусть админ выберет другого ученика; делать «открой любой курс из каталога» избыточно.

### 4. Правка `src/components/student/StudentLibrary.tsx` и `CourseCatalog.tsx`

Бейдж «Требуется видеоидентификация» на карточке курса (`needsVideoId`) тоже скрываем в режиме админа. Прокидываем `isAdminView` через пропсы из `StudentDashboard.tsx` (он уже есть в `useStudentDashboard`).

### 5. Защита от неправильного admin-view

В `getAdminViewData()`: если `userRole !== 'admin' && userRole !== 'organization'` (например, обычный пользователь подложил ключ в localStorage) — игнорируем флаг и чистим его. Защищает от попытки эскалации.

RLS-политики на `enrollments`, `lessons`, `lesson_progress`, `courses` для админов уже разрешают чтение чужих данных через `has_role('admin')` — миграции трогать **не нужно**. Менеджер организации при просмотре ученика своей организации тоже проходит RLS (`current_organization_id() = enrollment.organization_id`).

### 6. Тесты

- `useStudentDashboard.test.ts`: добавить кейс «при `adminViewAsStudent` `handleCourseClick` пропускает видеоидентификацию».
- Новый `adminViewMode.test.ts`: парсинг JSON, очистка невалидного флага.

## Что НЕ делаем

- Не меняем массовый просмотр уроков по факту прогресса (если ученик не дошёл до урока — урок остаётся `is_locked`; админ всё ещё пройдёт по лестнице, как ученик). Если позже понадобится «админ видит все уроки разблокированными» — добавим отдельным шагом.
- Не сохраняем никакие данные в БД в admin-view (никакого `course_access_log`, `lesson_progress`, `test_attempts`).
- Не трогаем RLS — текущих политик хватает.

## Технические детали

| Файл | Изменение |
|---|---|
| `src/utils/adminViewMode.ts` | новый: `getAdminViewData()`, `isAdminViewActive()` |
| `src/hooks/course-learning/useCourseLearningFacade.ts` | `effectiveUserId`, пропуск video-id и enrollment-проверки в admin-view, защита от записи |
| `src/pages/StudentDashboard.tsx` | `handleCourseClick`: пропуск video-id для admin; передача `isAdminView` в каталог |
| `src/components/student/StudentLibrary.tsx` | пропс `isAdminView`, скрытие `needsVideoId` бейджа |
| `src/components/student/CourseCatalog.tsx` | пропс `isAdminView`, скрытие `needsVideoId` бейджа |
| `src/utils/__tests__/adminViewMode.test.ts` | новые тесты |

