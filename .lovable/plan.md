
## Логика бесплатного тарифа при регистрации + ограничения интерфейса

### Что делаем

При регистрации организации (или физ. лица как организации) автоматически назначается бесплатный тариф "free" с жесткими ограничениями: 1 курс, 10 учеников, без ИИ, без документов/журналов и т.д. Интерфейс (сайдбар, функции) сразу отражает эти ограничения. Годовая скидка меняется с 20% на 15%.

### Тарифная сетка (напоминание)

| | Бесплатный | Старт | Стандарт | Профессиональный | Максимальный |
|---|---|---|---|---|---|
| Цена | 0 руб | 3 490 руб/мес | 6 990 руб/мес | 16 990 руб/мес | 24 990 руб/мес |
| Годовая скидка | -- | -15% | -15% | -15% | -15% |

### Технические шаги

#### 1. Миграция БД: добавить поле `subscription_plan` и обновить `create_organization`

Добавить в таблицу `organizations` новую колонку:
- `subscription_plan TEXT NOT NULL DEFAULT 'free'` -- значения: free, start, standard, professional, maximum

Обновить RPC-функцию `create_organization` (оба варианта):
- Устанавливать `subscription_plan = 'free'`, `tariff_type = 'free'`, `is_paid = false`
- Устанавливать `ai_enabled = false`, `storage_limit_bytes = 104857600` (100 МБ), `ai_tokens_limit = 0`

Создать функцию `apply_free_plan_features(org_id UUID)` которая вставляет записи в `organization_feature_categories`:
- `courses = true`, `students = true` -- доступны
- `companies = false`, `documents = false`, `journals = false`, `frdo = false`, `links = false`, `library = false`, `services = false` -- заблокированы
- `settings = true`, `student_cabinet = true` -- доступны

И в `organization_features`:
- `courses_ai = false` -- ИИ-генерация отключена

Вызвать эту функцию внутри `create_organization` после INSERT.

#### 2. Новый файл: `src/constants/subscriptionPlans.ts`

Константы всех 5 тарифов с лимитами:
```text
free:     courses=1,  students=10,  trained=10,  storage=100MB, ai=false, aiAudio=false
start:    courses=3,  students=50,  trained=30,  storage=1GB,   ai=false, aiAudio=false
standard: courses=10, students=200, trained=100, storage=5GB,   ai=false, aiAudio=false
professional: courses=30, students=1000, trained=500, storage=20GB, ai=false, aiAudio=false
maximum:  courses=unlimited, students=unlimited, trained=unlimited, storage=100GB, ai=true, aiAudio=true
```

Маппинг тарифов на доступные вкладки/категории и фичи. Годовая скидка = 15%.

#### 3. Новый хук: `src/hooks/useSubscriptionLimits.ts`

Загружает `subscription_plan` организации и возвращает:
- Лимиты (макс. курсов, учеников, хранилище)
- Текущее использование (количество курсов, учеников)
- Флаги (`canCreateCourse`, `canAddStudent`, `isAiEnabled`, `isAiAudioEnabled`)
- Функция `checkLimit(type)` -- проверка перед действием

#### 4. Изменить `src/hooks/useOrgFeatures.ts`

Добавить дополнительный слой: после загрузки фич из БД, также загрузить `subscription_plan` организации и применить ограничения тарифа поверх. Бесплатный тариф принудительно отключает категории `companies`, `documents`, `journals`, `frdo`, `links`, `library`, `services`.

#### 5. Изменить `src/components/organization/OrgSidebar.tsx`

Сайдбар уже использует `isEnabled()` -- никаких изменений не нужно, вкладки скроются автоматически через обновленный `useOrgFeatures`.

#### 6. Изменить компоненты с ограничениями по лимитам

- **CoursesTab** -- при нажатии "Создать курс" проверять лимит через `useSubscriptionLimits`. Если достигнут -- показать toast "Лимит бесплатного тарифа: 1 курс. Перейдите на тариф Старт" со ссылкой на страницу тарифов.
- **StudentsTab** -- аналогично при добавлении ученика проверять лимит (10 учеников на бесплатном).
- Отключить ИИ-генерацию курсов для тарифов без ИИ (проверка уже есть через `ai_enabled`).

#### 7. Изменить `src/components/landing/PricingPlans.tsx` (когда будет создан)

Годовая скидка = 15% вместо 20%.

#### 8. Изменить `src/pages/RegisterOrganization.tsx`

Никаких изменений в коде регистрации не нужно -- логика бесплатного тарифа будет в БД-функции `create_organization`.

### Порядок реализации

1. Миграция БД (новое поле + обновленная функция + apply_free_plan_features)
2. Константы тарифов (`subscriptionPlans.ts`)
3. Хук `useSubscriptionLimits`
4. Обновить `useOrgFeatures` для учета тарифного плана
5. Добавить проверки лимитов в CoursesTab и StudentsTab
6. Создать PricingPlans компонент со скидкой 15%
