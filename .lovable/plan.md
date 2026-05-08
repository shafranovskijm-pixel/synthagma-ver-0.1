## Проблема

Сегодня курсы открываются в 3–5 раз медленнее обычного (10–15 сек вместо 3). Я нашёл причину: на стороне ученика и в превью `lessons` грузятся целиком (`select('*')`), вместе с полем `content`. У слайдер‑уроков (презентаций) `content` хранит base64 PPTX/картинок и весит **8–11 МБ на урок**. На курсе с 8–10 уроками это **до 50–80 МБ JSON** в одном запросе → PostgREST тормозит/таймаутит, а на нестабильной сети пользователь видит «вечный спиннер» и пустые уроки.

В редакторе курса (`useCourseBuilder.ts`) этот же фикс уже сделан: оттуда `content` исключён, а тяжёлый контент догружается при открытии конкретного урока. На стороне обучения и превью — нет.

## Что сделаю

### 1. `src/hooks/course-learning/useCourseLearningFacade.ts` (главное)
- В `fetchCourseData` заменить `lessons.select('*')` на явный список колонок без `content` (id, title, type, order_index, module_id, is_locked, locked_until, test_passing_score, test_questions_to_show, ai_avatar_*, и т.д.).
- Добавить ленивую догрузку: при смене `currentLessonIndex`, если у `currentLesson.content === undefined`, делать одиночный `select('content').eq('id', currentLesson.id).single()` и записывать в локальный стейт. Кэшировать в памяти, чтобы повторно не дёргать.
- Уже загруженный курс с content для офлайна сохраняется как сейчас (в кэш кладётся то, что есть; для слайдеров content подтянется при первом открытии онлайн).

### 2. `src/hooks/useCoursePreview.ts`
- Тот же приём: `lessons.select('id,title,type,order_index,test_questions_count,is_locked')`, плюс отдельный запрос content для текущего урока.

### 3. `src/hooks/useCourseStoreManager.ts` (строка 275, дубликат курса)
- Это одноразовая операция копирования курса — `select('*')` оставлю, но добавлю чанковую вставку (по 5 уроков), чтобы один большой запрос не вешал клиент. Если воркфлоу-импакт большой — оставлю как есть, лишь логирование добавлю.

### 4. Мелкая защита от «зависших» открытий
- В `useCourseLearning`/`useCoursePreview` добавить таймаут запроса 15 сек: при превышении — fallback на офлайн-кэш (уже есть `getCachedCourseData`) и тост «Соединение медленное».
- Починить варнинг в консоли «Query data cannot be undefined … announcements-unread»: queryFn должна возвращать `null`/`[]` вместо `undefined` (находится в `useOrgNewIndicators`/`useAdminUnreadChats`-подобных хуках; найду точный файл по queryKey `announcements-unread` и добавлю явный return).

### 5. Проверка «уроки не пропадают»
- После изменения `select` пройдусь по точкам, где код раньше читал `lesson.content` напрямую (в `useLessonTTS`, `useLessonChat`, `SliderLessonViewer`, `useCourseLearningFacade.contentBlocks`) — все они теперь должны брать контент из догруженного значения. Адаптирую `currentLesson` так, чтобы из `lessons[currentLessonIndex]` отдавался merged-объект с подгруженным content (через `useMemo`), чтобы UI не пришлось переписывать.

## Технические детали

- Колонки lessons без content (повторяю список из CourseBuilder для совместимости):  
  `id, course_id, title, type, order_index, module_id, is_locked, locked_until, test_passing_score, test_questions_to_show, ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id, ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject, ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model`.
- Догрузка content: `Map<lessonId, string|null>` в ref + `useState` для триггера ререндера. Загружается параллельно с переходом, плюс preload соседнего урока (i+1).
- Никаких миграций БД и изменений RLS не требуется.

## Что НЕ меняю
- Логику прогресса, тестов, чата, видео — там фиксы уже сделаны в прошлых сообщениях.
- Загрузку курса в редакторе (`useCourseBuilder`) — уже оптимизирована.
- Дизайн.

## Проверка
- Открыть курс БОИЧС и курс Владивостокского центра охраны труда: первая отрисовка списка уроков ≤ 1.5 сек; презентационные уроки подгружаются при клике за 1–3 сек.
- В консоли — нет ошибки про `Query data cannot be undefined`.
- Network: запрос `lessons?...` возвращает <100 КБ вместо 50+ МБ.