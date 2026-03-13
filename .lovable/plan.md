

## Аудит: Логирование в историю генерации

### Найденные проблемы

| Компонент | Логирует в `generation_history`? | Что логирует |
|---|---|---|
| **ContentGeneratorTab** (генератор в маркетплейсе) | ✅ Да | structure, content (+image/audio), questions, answers |
| **BulkContentGenerator** (конвейер в конструкторе курсов) | ❌ **Нет** | Ничего — ни структуру, ни контент, ни медиа, ни тесты |
| **Edge-функции** (generate-image, generate-lesson-content, salutespeech-tts) | ❌ Нет | Не логируют на стороне сервера |

### Проблема 1: BulkContentGenerator не пишет в историю

Все 4 фазы конвейера (`generateStructure`, `generateContent`, `generateMedia`, `solveTests`) не вставляют записи в `generation_history`. Это значит, что при генерации курсов через конструктор (диалог «Конвейер») вкладка «История» в маркетплейсе остаётся пустой.

### Проблема 2: Нет привязки к организации

Таблица `generation_history` не имеет поля `organization_id` — записи глобальные. Для организационного дашборда потребуется либо добавить `organization_id`, либо джойнить через `courses.organization_id`.

### Проблема 3: Нет фильтра "медиа" в истории

`GenerationHistoryTab` поддерживает фильтры: structure, content, questions, answers. Нового типа `media` (изображения/аудио) нет.

---

### План исправления

#### 1. BulkContentGenerator — добавить логирование во все фазы

В `src/components/admin/BulkContentGenerator.tsx`:

- **Phase 1 (structure)**: после `supabase.from("lessons").insert(...)` — вставить запись `action: "structure"`
- **Phase 2 (content)**: после `supabase.from("lessons").update(...)` в `generateContent` — вставить запись `action: "content"`
- **Phase 3 (media)**: после успешной генерации image/audio в `generateMedia` — вставить запись `action: "media"` с деталями (что сгенерировано: изображение, аудио или оба)
- **Phase 4 (tests)**: после решения тестов в `solveTests` — вставить запись `action: "answers"`

Каждая вставка: `supabase.from("generation_history").insert({ course_id, course_title, action, details, items_count, duration_ms })`

#### 2. GenerationHistoryTab — добавить поддержку типа "media"

В `src/components/admin/GenerationHistoryTab.tsx`:

- Добавить `media` в `ACTION_META` (иконка `ImageIcon`, цвет розовый)
- Добавить `<SelectItem value="media">Медиа</SelectItem>` в фильтр

#### 3. Организационная история (подготовка)

Для будущего отображения в дашборде организации — история уже доступна через джойн `generation_history.course_id → courses.organization_id`. Отдельную вкладку в орг-дашборд можно добавить следующим шагом после проверки работоспособности.

---

### Файлы для изменения

- `src/components/admin/BulkContentGenerator.tsx` — добавить `generation_history.insert()` в 4 фазы
- `src/components/admin/GenerationHistoryTab.tsx` — добавить тип `media` в фильтр и метаданные

