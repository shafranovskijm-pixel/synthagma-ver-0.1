
## Анализ текущей системы

**Три раздела на скриншотах:**
1. **Индивидуальные лимиты** (числовые: курсы, ученики, обученные, ИИ, хранилище) — уже работают через `custom_*` поля + `useSubscriptionLimits` ✅
2. **Индивидуальные возможности** (включаемые категории) — есть в админке, сохраняются в `custom_enabled_categories`, применяются в `useOrgFeatures`. Но **категории-ключи рассинхронизированы** с фактическими feature-флагами тарифа.
3. **Возможности на старших тарифах** (плашка в кабинете организации, `SubscriptionTab.tsx`) — фильтруется только по части ключей.

## Главные проблемы

1. **Видеосервис+** (`limits.kinescopeEnabled`) **не имеет переключателя** в «Индивидуальные возможности» — админ не может включить его независимо от тарифа.
2. **Несоответствие ключей**: в админке есть `video_id`, `document_checklist`, `branding`, `ai_generation`, `unlimited` — но `useOrgFeatures` проверяет только список «категорий» (`courses`, `webinars`, `frdo` …). А `useSubscriptionLimits` для feature-флагов (`kinescopeEnabled`, `videoServicePlus`, `branding`, `videoIdentification`, `documentChecklist`, `trainersEnabled`) **вообще не учитывает** `custom_enabled_categories`.
3. **Плашка «доступно на старших»** использует свой собственный список `FEATURE_HIGHLIGHTS` с ключами (`branding`, `video_id`, …), не покрывающий Видеосервис+ и вебинары.

## План унификации

### 1. Единый реестр функций — `src/constants/orgFeatureCatalog.ts` (новый)

Один источник правды для всех 3 мест:
```ts
export interface OrgFeatureDef {
  key: string;              // 'kinescope', 'webinars', 'frdo', 'branding', …
  label: string;            // UI: «Видеосервис+»
  description: string;      // UI: «Загрузка видео >2 ГБ через защищённый хостинг»
  icon: LucideIcon;
  minPlan: SubscriptionPlan;     // минимальный тариф, где доступно
  planFlag?: keyof PlanLimits;   // флаг в plan.limits (kinescopeEnabled, …)
  category?: string;             // категория в plan.enabledCategories (webinars, frdo, …)
}

export const ORG_FEATURE_CATALOG: OrgFeatureDef[] = [
  { key: 'kinescope',          label: 'Видеосервис+',     minPlan: 'professional', planFlag: 'kinescopeEnabled', … },
  { key: 'webinars',           label: 'Вебинары',          minPlan: 'professional', category: 'webinars', … },
  { key: 'frdo',               label: 'ФИС ФРДО',          minPlan: 'free',         category: 'frdo',     … },
  { key: 'labor_safety',       label: 'Охрана труда',      minPlan: 'professional', category: 'labor_safety', … },
  { key: 'journals',           label: 'Журналы',           minPlan: 'professional', category: 'journals', … },
  { key: 'documents',          label: 'Документооборот',   minPlan: 'professional', category: 'documents', … },
  { key: 'services',           label: 'Магазин курсов',    minPlan: 'professional', category: 'services', … },
  { key: '3d_trainers',        label: '3D-тренажёры',      minPlan: 'maximum',      planFlag: 'trainersEnabled', category: '3d_trainers', … },
  { key: 'branding',           label: 'Брендирование',     minPlan: 'standard',     planFlag: 'branding',  … },
  { key: 'video_id',           label: 'Видео-идентификация', minPlan: 'standard',   planFlag: 'videoIdentification', … },
  { key: 'document_checklist', label: 'Чек-лист документов', minPlan: 'standard',   planFlag: 'documentChecklist',  … },
  { key: 'ai_generation',      label: 'ИИ-генерация',      minPlan: 'free',         planFlag: 'aiEnabled', … },
  { key: 'video_service_plus', label: 'Видео >2 ГБ',       minPlan: 'professional', planFlag: 'videoServicePlus', … },
];
```

Хелпер `isFeatureAvailable(feature, plan, customCategories)` — единая проверка: «доступно по тарифу ИЛИ включено в индивидуальных возможностях».

### 2. Админ-панель `OrgTariffsPanel.tsx`
Перерендерить блок «Индивидуальные возможности» из `ORG_FEATURE_CATALOG` (вместо хардкода). Все позиции, включая **Видеосервис+** и **Вебинары**, становятся переключаемыми галочками.

### 3. `useSubscriptionLimits.ts`
Дополнительно загружать `custom_enabled_categories` и применять их как override к `limits`:
- `kinescope` → `limits.kinescopeEnabled = true`
- `webinars` → `limits.webinarsEnabled = true`
- `branding` → `limits.branding = true`
- и т.д. через маппинг из каталога.

Таким образом, везде, где код проверяет `limits.kinescopeEnabled` (например, в видео-блоке через «+»), флаг отработает — независимо от тарифа.

### 4. Кабинет организации `SubscriptionTab.tsx`
Заменить локальный `FEATURE_HIGHLIGHTS` на генерацию из `ORG_FEATURE_CATALOG`:
- Показывать **только те функции**, которые `minPlan > currentPlan` **и** не включены индивидуально (`!customEnabledCategories.includes(key)`).
- Колонка «Сравнение тарифов» (`featureRows` в `useSubscriptionTab.ts`) тоже формируется из каталога — добавится строка «Видеосервис+».

### 5. Без изменений
- БД (`custom_enabled_categories` уже есть как `text[]`).
- Edge-функции.
- `useOrgFeatures.ts` уже корректно применяет `custom_enabled_categories` к категориям — добавим только пропуск ключей-флагов (они идут через `useSubscriptionLimits`).

## Что увидит пользователь

- **Админ** в карточке организации: галочка «Видеосервис+», «Вебинары», «3D-тренажёры», «Охрана труда», «Брендирование» и т.д. — все возможности из каталога. Включил → организация получает доступ независимо от тарифа.
- **Организация** в кабинете → «Тарифный план»: плашка «Возможности на старших тарифах» автоматически скрывает то, что админ ей включил индивидуально. Сравнение тарифов содержит Видеосервис+.
- **Видео-блок через «+»** перестаёт показывать «заглушку Lock» если админ включил Видеосервис+ для этой организации.

## Технические детали
- Никаких миграций — `custom_enabled_categories` существует.
- `OrgFeatureDef.planFlag` сужен через `keyof PlanLimits` для type-safety.
- `useSubscriptionLimits` запрос расширяется: добавляем `custom_enabled_categories` к существующему `select`.
- Realtime UPDATE на `organizations` уже подписан — изменения админа применятся мгновенно.
