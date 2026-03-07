

# План: Вкладка «ИИ-провайдеры» в админ-панели

## Обзор

Создать новую вкладку «ИИ» в сайдбаре админки с полной настройкой ИИ-провайдеров для разных контекстов использования: генерация курсов, озвучка, ИИ-консультант, маркетплейс, пользовательские запросы, организации.

## Структура вкладки

```text
┌──────────────────────────────────────────────────┐
│  🤖 Настройки ИИ-провайдеров                     │
├──────────────────────────────────────────────────┤
│                                                  │
│  ▼ Генерация курсов (для организаций)            │
│    Провайдер: [GigaChat ▼] / [Lovable AI ▼]     │
│    Модель GigaChat: [Max ▼] [Pro ▼] [Lite ▼]    │
│    Потоки: [3 ▼]                                 │
│                                                  │
│  ▼ Озвучка (TTS)                                 │
│    Провайдер: [ElevenLabs ▼] / [Lovable AI ▼]   │
│    API Key: [••••••••••] (если свой)             │
│                                                  │
│  ▼ ИИ-консультант (чат)                          │
│    Провайдер: [GigaChat ▼] / [Lovable AI ▼]     │
│    Модель: [GigaChat-Max ▼]                      │
│                                                  │
│  ▼ Маркетплейс (описания, SEO)                   │
│    Провайдер: [Lovable AI ▼]                     │
│    Модель: [Gemini Flash ▼]                      │
│                                                  │
│  ▼ Конвейер (Bulk Pipeline)                      │
│    Стратегия: [Round-Robin ▼] / [Один провайдер] │
│    Slot-0 модель: [Max ▼]                        │
│    Slot-1 модель: [Pro ▼]                        │
│    Gemini модель: [Flash ▼]                      │
│    Параллельность: [3 ▼]                         │
│                                                  │
│  ▼ Дефолт для организаций                        │
│    Провайдер по умолчанию: [GigaChat ▼]          │
│    Разрешить орг-м менять: [✓]                   │
│                                                  │
│  ▼ API-ключи                                     │
│    GIGACHAT_AUTH_KEY:   [••••] [Изменить]         │
│    GIGACHAT_AUTH_KEY_2: [••••] [Изменить]         │
│    ELEVENLABS_API_KEY:  [••••] [Изменить]         │
│    Свой OpenAI:         [    ] [Сохранить]        │
│                                                  │
│  [💾 Сохранить настройки]                         │
└──────────────────────────────────────────────────┘
```

## Изменения в БД

Создать таблицу `ai_settings` для хранения конфигурации:

```sql
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL UNIQUE, -- 'course_generation', 'tts', 'consultant', 'marketplace', 'pipeline', 'org_default'
  provider text NOT NULL DEFAULT 'gigachat', -- 'gigachat', 'lovable_ai', 'round_robin'
  gigachat_model text DEFAULT 'GigaChat-Pro', -- Max, Pro, Lite
  lovable_model text DEFAULT 'google/gemini-2.5-flash',
  concurrency int DEFAULT 3,
  extra_config jsonb DEFAULT '{}', -- slot models, etc.
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- RLS: только админы
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_ai_settings" ON public.ai_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

## Файлы для создания/изменения

1. **`src/components/admin/AISettingsManager.tsx`** — новый компонент вкладки с секциями:
   - Каждый контекст (курсы, TTS, консультант, маркетплейс, конвейер) — отдельная `<details>` секция
   - Select для выбора провайдера и модели
   - Input для API-ключей (маскированный, с кнопкой «показать»)
   - Настройка concurrency для конвейера
   - Настройка модели каждого слота отдельно

2. **`src/components/admin/AdminSidebar.tsx`** — добавить пункт «ИИ» (`Bot` icon) в навигацию

3. **`src/pages/AdminDashboard.tsx`** — добавить `"ai"` в `AdminTabType`, рендер `<AISettingsManager />`

4. **`supabase/functions/_shared/gigachat-client.ts`** — чтение настроек из `ai_settings` при инициализации (опционально, для будущей динамической конфигурации)

## Логика работы

- При загрузке компонент читает все записи из `ai_settings`
- При сохранении делает `upsert` по полю `context`
- API-ключи сохраняются через edge function (secrets), показываются маскированно
- Настройки конвейера (slot models, concurrency) сохраняются в `extra_config` JSON
- Edge-функции при вызове могут читать `ai_settings` для динамического выбора провайдера

