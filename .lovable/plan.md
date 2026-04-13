

# Inline-просмотр материалов + настройка скачивания

## Проблема
Сейчас материалы в предпросмотре курса открываются только через `FilePreviewDialog` (iframe). Видео не воспроизводится inline, нет разделения по типам. Также нет настройки «разрешить/запретить скачивание».

## Что будет сделано

### 1. Умное отображение материалов по типу
В секции «Материалы курса» (`CoursePreview.tsx`) — при клике на материал:
- **Видео** (mp4, webm, mov, avi): воспроизведение inline через `<video>` тег прямо на странице
- **PDF, DOC, PPT, XLS**: открытие через `FilePreviewDialog` (уже работает)
- **Изображения** (jpg, png, gif): показ inline через `<img>`
- Добавить иконки для видео (`Video`) и изображений (`Image`) в список материалов

### 2. Миграция: колонка `allow_materials_download` в таблице `courses`
```sql
ALTER TABLE public.courses 
ADD COLUMN allow_materials_download boolean NOT NULL DEFAULT true;
```

### 3. Настройка скачивания в настройках курса
В `CoursePageSettingsContent.tsx` (вкладка «Страница») добавить переключатель:
- Label: **«Разрешить скачивание материалов»**
- Описание: «Ученики смогут скачивать файлы из раздела Материалы курса»
- Связать с полем `allow_materials_download`

### 4. Условное отображение кнопки скачивания
В `CoursePreview.tsx` и `FilePreviewDialog.tsx`:
- Если `allow_materials_download = false` — скрыть кнопку «Скачать» / `Download`
- Для видео: добавить `controlsList="nodownload"` на `<video>`

## Файлы

| Файл | Изменение |
|---|---|
| `CoursePreview.tsx` | Inline-видео и изображения для материалов, передача флага скачивания, fetch поля `allow_materials_download` |
| `CoursePageSettingsContent.tsx` | Переключатель «Разрешить скачивание материалов» |
| `FilePreviewDialog.tsx` | Условное скрытие кнопки «Скачать» |
| Миграция SQL | `allow_materials_download` колонка в `courses` |

