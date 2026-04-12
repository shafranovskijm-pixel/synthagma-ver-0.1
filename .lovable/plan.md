

# Проверка и исправления: вебинары, курсы, видео, кнопка Kinescope

## Результаты проверки

### 1. Вебинары — работают
- Таблица `webinars` создана, есть 2 тестовых записи (external, scheduled)
- `WebinarsManager` подключён к вкладке "Вебинары" в CoursesTab — **работает корректно**
- `CreateWebinarDialog`, `WebinarParticipantsDialog` — на месте
- `kinescope-proxy` поддерживает `create_live`, `stop_live`, `get_live`, `list_live`
- Студентский список вебинаров (`StudentWebinarsList`) подключён

### 2. Курсы ИП Дмитриева — 6 jobs до сих пор в статусе `error`
- Все 6 failed jobs по-прежнему имеют статус `error` с ошибкой "Signal timed out"
- Они **не были сброшены** на `pending` — нужно выполнить сброс и перезапустить

### 3. Спецсимволы в контенте — есть проблемы
- В ~10 уроках обнаружены HTML-теги внутри JSON-контента: `<br>`, `<mark class=...>`, `<b>`, и т.д.
- Эти теги приходят из SkillSpace и не конвертируются в структурированные блоки редактора
- Нужно написать SQL-скрипт для очистки HTML-тегов из поля `content` в таблице `lessons`

### 4. Видео — 129 из 135 видео ещё на selcdn, 0 в Kinescope
- Миграция в Kinescope **не была запущена** — все видео остались на внешних CDN
- 12 видео на Supabase Storage, 129 на selcdn/selstorage

### 5. Кнопка "Видео → Kinescope" — удалить
- Глобальная кнопка в тулбаре (строка ~1370)
- В dropdown-меню каждого курса (3 места: строки ~872-878, ~1024-1030, ~1174-1180)
- Связанные функции и state (`handleMigrateVideosToKinescope`, `handleMigrateAllVideosToKinescope`, `migratingVideosCourseId`, `migratingAllVideos`)

## Что делаем

### Шаг 1: Убрать кнопку "Видео → Kinescope" из UI
**Файл:** `src/components/organization/tabs/CoursesTab.tsx`
- Удалить глобальную кнопку "Видео → Kinescope" из тулбара
- Удалить пункт "Перенести видео в Kinescope" из всех 3-х dropdown-меню курсов
- Удалить неиспользуемые функции `handleMigrateVideosToKinescope`, `handleMigrateAllVideosToKinescope` и state `migratingVideosCourseId`, `migratingAllVideos`

### Шаг 2: Сбросить failed import jobs и перезапустить
**SQL миграция:**
```sql
UPDATE skillspace_import_jobs 
SET status = 'pending', error_message = NULL 
WHERE status = 'error' 
AND url LIKE '%vandadmitrieva%';
```
Затем вызвать `batch-skillspace-import` для обработки.

### Шаг 3: Очистить HTML-теги в контенте уроков
**SQL миграция:** Заменить `<br>`, `<b>`, `</b>`, `<mark ...>`, `</mark>` на пустую строку или перенос строки в поле `content` уроков организации Дмитриевой.

### Шаг 4: Запустить миграцию видео в Kinescope
Вызвать edge function `kinescope-migrate-videos` с `organization_id` Дмитриевой для переноса всех 129+12 видео.

## Затрагиваемые файлы
- `src/components/organization/tabs/CoursesTab.tsx` — удаление кнопок и функций миграции
- SQL — сброс jobs, очистка HTML-тегов
- Edge function вызовы — `batch-skillspace-import`, `kinescope-migrate-videos`

