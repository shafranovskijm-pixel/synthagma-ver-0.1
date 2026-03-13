

## Вкладка «История» генерации контента

### Что делаем
Добавляем вкладку **«История»** (📋) в маркетплейс-менеджер, где отображается лог всех действий генерации: какой курс, какой этап (структура / контент / вопросы / ответы), когда, сколько элементов обработано.

### Реализация

**1. Таблица `generation_history`** (миграция)
```sql
CREATE TABLE public.generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  course_title text NOT NULL,
  action text NOT NULL,          -- 'structure' | 'content' | 'questions' | 'answers'
  details text,                  -- e.g. "Сгенерировано 12 уроков" / "Контент для урока «Тема 1»"
  items_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage generation_history"
  ON public.generation_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

**2. Новый компонент `src/components/admin/GenerationHistoryTab.tsx`**
- Загружает записи из `generation_history` с сортировкой по `created_at DESC`
- Группировка по дате
- Каждая запись: время, название курса, действие (бейдж), детали, кол-во элементов
- Фильтр по действию (все / структура / контент / вопросы / ответы)
- Кнопка «Очистить историю»

**3. Изменения в `ContentGeneratorTab.tsx`**
В ключевых местах `handleGenerateCourse` добавить запись в `generation_history`:
- После генерации структуры: `{ action: 'structure', details: "Создано X уроков", items_count: X }`
- После генерации контента каждого урока: `{ action: 'content', details: "Контент: «Название урока»" }`
- После генерации вопросов: `{ action: 'questions', details: "Вопросы для «Тест»", items_count: N }`
- После решения ответов: `{ action: 'answers', details: "Решено X вопросов" }`

**4. Изменения в `AdminMarketplaceManager.tsx`**
- Добавить `TabsTrigger value="history"` с иконкой `History` (из lucide)
- Добавить `TabsContent value="history"` → `<GenerationHistoryTab />`

### Файлы

| Файл | Действие |
|---|---|
| Миграция БД | Создать `generation_history` |
| `src/components/admin/GenerationHistoryTab.tsx` | Новый — UI вкладки |
| `src/components/admin/ContentGeneratorTab.tsx` | Вставки записей в историю после каждого этапа |
| `src/components/admin/AdminMarketplaceManager.tsx` | Добавить вкладку «История» |

