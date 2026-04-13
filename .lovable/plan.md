

# Достижения в настройках курса

## Суть
Добавить вкладку «Достижения» в боковое меню курса, где можно выбрать достижения из общего пула организации и привязать их к конкретному курсу.

## Что будет сделано

### 1. Миграция: таблица `course_achievements`
```sql
CREATE TABLE public.course_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(course_id, achievement_id)
);
ALTER TABLE public.course_achievements ENABLE ROW LEVEL SECURITY;
-- RLS: authenticated users с доступом к организации
```

### 2. Новый компонент `CourseAchievementsTab.tsx`
- Хук загружает все достижения организации (`achievements` where `organization_id = orgId`)
- Загружает привязанные к курсу (`course_achievements` where `course_id`)
- Отображает список достижений с чекбоксами — включить/выключить для курса
- Карточки с иконкой, названием, редкостью (стили из `RARITY_STYLES`)
- При toggle — insert/delete в `course_achievements`

### 3. Обновить `CourseDetailsContent.tsx`
- Добавить таб `"achievements"` в тип `activeTab` (в union type и в `CourseDetailsContentProps`)
- Добавить пункт меню «Достижения» с иконкой `Trophy` в секцию «Обучение» сайдбара
- Рендерить `CourseAchievementsTab` при `activeTab === "achievements"`

### 4. Обновить `useCourseDetailsModal.ts`
- Добавить `"achievements"` в тип `CourseDetailsTabType`

## Файлы

| Файл | Изменение |
|---|---|
| Миграция | Создать таблицу `course_achievements` с RLS |
| `src/components/organization/CourseAchievementsTab.tsx` | **Новый** — выбор достижений для курса |
| `src/components/organization/CourseDetailsContent.tsx` | Добавить таб и пункт меню |
| `src/hooks/useCourseDetailsModal.ts` | Расширить тип табов |

