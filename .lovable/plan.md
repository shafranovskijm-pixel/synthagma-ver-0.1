

## Кнопка «Скачать медиа» для существующих курсов

### Что нужно

Добавить кнопку в таблице курсов (рядом с кнопкой удаления) для миграции медиафайлов уже импортированных курсов — скачать видео/изображения/документы с внешних серверов (selstorage.ru, skillspace.ru) в наше хранилище `course-files`.

### Техническое решение

**1. Новая Edge Function `migrate-course-media`**

Отдельная функция, которая:
- Принимает `courseId` и `organizationId`
- Загружает все уроки курса из БД
- Проходит по JSON-блокам каждого урока
- Для блоков `video`, `image`, `document` с внешними URL — скачивает файл и загружает в `course-files/{orgId}/{courseId}/{uuid}.{ext}`
- Заменяет URL в контенте урока и обновляет запись в БД
- Пропускает файлы, которые уже на нашем хранилище (URL содержит `supabase`)
- Возвращает статистику: `filesTransferred`, `filesFailed`, `filesSkipped`

Логика скачивания/загрузки — копия из `parse-skillspace-course` (тот же `downloadAndReupload` паттерн), но без авторизации SkillSpace (файлы на selstorage.ru доступны публично).

**2. UI — кнопка в таблице курсов**

В `OrganizationDetailsView.tsx`:
- Добавить кнопку с иконкой `HardDrive` (или `CloudDownload`) в каждой строке курса
- По клику — вызов `migrate-course-media` с `fetch` (таймаут 5 минут, как в SkillSpace импорте)
- Показывать `Loader2` во время миграции
- Toast с результатом: «Перенесено X файлов, ошибок Y»

**3. Файлы для изменения**

- `supabase/functions/migrate-course-media/index.ts` — новая Edge Function
- `src/components/admin/OrganizationDetailsView.tsx` — кнопка в таблице курсов

