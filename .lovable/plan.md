
# Добавление прикрепления файлов (PDF, DOC) и методических материалов к урокам

## Что будет сделано

Каждый урок в конструкторе курсов получит секцию **"Прикрепленные файлы"** -- возможность загружать PDF, DOC, DOCX и другие файлы как лекционные материалы и методические пособия. Студенты увидят эти файлы при прохождении урока и смогут их скачать/открыть.

## Изменения

### 1. Новая таблица `lesson_attachments` (миграция)

```text
id          UUID PK
lesson_id   UUID FK -> lessons(id) ON DELETE CASCADE
name        TEXT NOT NULL         -- имя файла
file_url    TEXT NOT NULL         -- URL в storage
file_type   TEXT                  -- pdf, doc, docx, etc.
file_size   BIGINT                -- размер в байтах
category    TEXT DEFAULT 'material' -- 'lecture' | 'material' | 'other'
order_index INTEGER DEFAULT 0
created_at  TIMESTAMPTZ
```

RLS-политики: чтение для всех аутентифицированных, запись для владельцев организации (через lessons -> courses -> organization_id).

### 2. Конструктор курсов -- секция прикрепленных файлов

**Файл:** `src/components/course-builder/LessonTypeConfig.ts`
- Добавить поле `attachments` в интерфейс `Lesson`

**Файл:** `src/components/course-builder/LessonAttachments.tsx` (новый)
- Компонент с двумя категориями: "Лекции" и "Методические материалы"
- Drag-drop зона для загрузки файлов (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX)
- Список загруженных файлов с иконками по типу, именем, размером и кнопкой удаления
- Загрузка в бакет `course-files` через `uploadToStorage`

**Файл:** `src/components/course-builder/SortableLessonItem.tsx`
- Добавить `<LessonAttachments />` в конец каждого развернутого урока (для всех типов: text, video, audio, test, slider)

### 3. Сохранение вложений

**Файл:** `src/hooks/useCourseBuilder.ts`
- В `saveCourse()` после сохранения уроков -- сохранять/обновлять записи в `lesson_attachments`
- При загрузке курса -- подгружать attachments для каждого урока

### 4. Отображение для студентов

**Файл:** `src/pages/CourseLearning.tsx`
- После основного контента урока (текст/видео/аудио/тест) показывать секции "Лекции" и "Методические материалы" с карточками файлов
- Файлы открываются в новой вкладке или скачиваются
- Дизайн: карточки с иконкой типа файла (PDF, DOC), названием, кнопкой скачивания -- как на втором скриншоте

### 5. Хук для работы с вложениями

**Файл:** `src/hooks/useLessonAttachments.ts` (новый)
- CRUD-операции: загрузка файла, удаление, получение списка
- Работа с `course-files` бакетом
- Оптимистичное обновление UI

## Технические детали

- Бакет `course-files` уже существует и публичный -- используем его
- Файлы сохраняются по пути: `{courseId}/attachments/{lessonId}/{filename}`
- Поддерживаемые форматы: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT
- Максимальный размер файла: 50 МБ
- Категории файлов: `lecture` (лекции/PDF учебного модуля) и `material` (методические материалы)
