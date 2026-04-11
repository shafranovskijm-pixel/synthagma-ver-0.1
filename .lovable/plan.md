

## Автоматическое добавление выпускников в журнал документов

### Что сейчас
При завершении курса студент получает статус `completed`, но в журнал документов (удостоверения/дипломы/свидетельства) он попадает только вручную — через кнопку «Из выпускников». Нет связи между `frdo_program_type` курса и типом документа.

### Что будет сделано

**1. Создать триггер БД для автоматического создания записи в журнале документов**

При изменении `enrollments.status` на `completed` — триггер проверяет `frdo_program_type` курса и автоматически создаёт запись в `education_document_records` с правильным типом документа:

```text
qualification_upgrade     → certificate    (Удостоверение)
professional_retraining   → diploma        (Диплом)
professional_training     → qualification  (Свидетельство)
```

Если у курса не настроен `frdo_program_type` — запись НЕ создаётся автоматически (остаётся ручной режим через кнопку).

Триггер автоматически заполнит: ФИО, дату рождения (из `student_frdo_data`), название курса, дату выдачи, регистрационный номер, номер документа.

**2. Фильтрация выпускников по типу документа в диалоге**

В `loadCompletedStudents` — дополнительно загружать `frdo_program_type` из курсов. В `filteredStudents` и в `handleAutoAddAllGraduates` / `handleCreateFromStudents` — фильтровать по соответствию типа программы и текущей вкладки. Автоматически выставлять правильный `document_type`.

**3. Исправление визуализации диалога «Из выпускников»**

Добавить `overflow-hidden` и `truncate` для длинных названий курсов в диалоге выбора.

### Технические детали

- Новая SQL-миграция: функция `auto_create_education_document()` + триггер `AFTER UPDATE ON enrollments`
- Триггер срабатывает ПОСЛЕ `auto_complete_enrollment` (который BEFORE UPDATE), поэтому `status` уже будет `completed`
- Защита от дублей: проверка `NOT EXISTS` по `enrollment_id` в `education_document_records`
- Изменения в `useEducationDocumentsJournal.ts`: расширение `CompletedStudent`, фильтрация, маппинг типов
- Изменения в `EducationDocumentsJournal.tsx`: CSS-фикс диалога

