

## План: Банк знаний + создание курсов из перечня программ

### Что нужно сделать

Пользователь хочет:
1. Создать ~43 курса из загруженного DOCX-перечня программ (охрана труда, пожарная безопасность, экология, рабочие профессии)
2. Загрузить свои DOC-файлы с лекциями в «банк знаний»
3. При генерации контента конвейер сначала ищет подходящий материал в банке знаний по тематике, и только потом обращается к ИИ

### Архитектура решения

```text
┌─────────────────────────────────────────────────┐
│  Админ-панель маркетплейса                      │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Вкладка      │  │ Вкладка «Банк знаний»    │ │
│  │ «Импорт»     │  │  - Загрузка DOC/DOCX     │ │
│  │ (уже есть)   │  │  - Парсинг → lessons DB  │ │
│  │ + Парсер      │  │  - Просмотр материалов   │ │
│  │   перечня     │  └──────────────────────────┘ │
│  └──────────────┘                                │
│                         ↓                        │
│  find_similar_lesson_content (pg_trgm, уже есть) │
│                         ↓                        │
│  Конвейер: банк → ИИ (уже работает)             │
└─────────────────────────────────────────────────┘
```

### Шаг 1: Таблица «Банк знаний» (миграция)

Новая таблица `knowledge_bank` для хранения загруженных лекций:

```sql
CREATE TABLE public.knowledge_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,              -- HTML-контент из DOC
  source_filename TEXT,
  tags TEXT[],               -- ключевые слова для поиска
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.knowledge_bank ENABLE ROW LEVEL SECURITY;

-- Админы видят всё
CREATE POLICY "Admin full access" ON public.knowledge_bank
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));
```

### Шаг 2: RPC для поиска в банке знаний

```sql
CREATE OR REPLACE FUNCTION public.find_knowledge_bank_content(
  p_title TEXT, p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE(id UUID, title TEXT, content TEXT, similarity_score FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT kb.id, kb.title, kb.content,
         similarity(lower(kb.title), lower(p_title))::float
  FROM knowledge_bank kb
  WHERE kb.content IS NOT NULL AND length(kb.content) > 100
    AND similarity(lower(kb.title), lower(p_title)) > p_min_similarity
  ORDER BY similarity_score DESC LIMIT 1;
$$;
```

### Шаг 3: Парсер перечня программ → массовое создание курсов

В `AdminMarketplaceManager.tsx` добавить кнопку «Импорт перечня программ» (рядом с существующим BulkCourseImporter). Логика:
- Загрузка DOCX → парсинг таблицы через `import-course` edge function
- Извлечение строк: название программы, часы
- Создание курсов + marketplace_courses одним батчем (аналогично `BulkCourseImporter.handleGenerate`)

### Шаг 4: Вкладка «Банк знаний» в админ-панели

Новая вкладка в `AdminMarketplaceManager` (или отдельная вкладка в админ-панели):
- Drag & drop загрузка DOC/DOCX файлов (множественная)
- Отправка в `import-course` edge function для парсинга HTML
- Сохранение результата в `knowledge_bank`
- Список загруженных материалов с поиском

### Шаг 5: Интеграция банка в конвейер

В `useBulkPipeline.ts` перед вызовом `find_similar_lesson_content` добавить вызов `find_knowledge_bank_content`. Приоритет:
1. In-memory кэш (уже есть)
2. `find_knowledge_bank_content` — банк знаний
3. `find_similar_lesson_content` — похожие уроки в БД
4. ИИ-генерация (fallback)

### Файлы для изменения/создания

| Файл | Что |
|---|---|
| **Миграция** | Таблица `knowledge_bank` + RPC `find_knowledge_bank_content` |
| `src/components/admin/KnowledgeBankTab.tsx` | **Новый** — UI загрузки и просмотра материалов |
| `src/components/admin/ProgramListImporter.tsx` | **Новый** — парсер перечня программ из DOCX |
| `src/components/admin/AdminMarketplaceManager.tsx` | Добавить вкладку «Банк знаний» + кнопку импорта перечня |
| `src/hooks/useBulkPipeline.ts` | Добавить поиск в knowledge_bank перед ИИ |

### Порядок действий

1. Создать таблицу и RPC (миграция)
2. Создать `ProgramListImporter` — парсинг DOCX-перечня → создание курсов
3. Создать `KnowledgeBankTab` — загрузка лекций
4. Обновить конвейер — поиск в банке знаний
5. Интегрировать в UI админ-панели

