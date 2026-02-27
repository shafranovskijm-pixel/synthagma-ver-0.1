

# Обновление тарифов и видимость всех разделов на бесплатном тарифе

## Что меняется

### 1. Обновление лимитов тарифных планов

Файл: `src/constants/subscriptionPlans.ts`

| Параметр | Было | Станет |
|----------|------|--------|
| Бесплатный: курсы | 1 | 3 |
| Старт: курсы | 3 | 10 |
| Стандарт: курсы | 10 | 30 |
| Профессиональный: курсы | 30 | 50 |
| Профессиональный: хранилище | 20 ГБ | 50 ГБ |
| Профессиональный: ФИС ФРДО | нет | да |
| Профессиональный: Отчеты 1-ПК/1-ПО | нет | да |

### 2. Все разделы видны на бесплатном тарифе

Файл: `src/constants/subscriptionPlans.ts` -- в `enabledCategories` для тарифа `free` добавить **все** категории (companies, documents, journals, frdo, links, library, labor_safety).

Файл: `src/components/organization/OrgSidebar.tsx` -- вместо полного скрытия недоступных вкладок, показывать их всегда, но при нажатии на заблокированную вкладку показывать диалог "Недоступно на вашем тарифе".

### 3. Диалог "Недоступно на данном тарифе"

При нажатии на любую функцию/раздел, недоступный на текущем тарифе, показывать `AlertDialog` с текстом:

> **Недоступно на вашем тарифе**
> Эта функция доступна начиная с тарифа "X". Хотите расширить тариф?
> [Перейти к тарифам] [Закрыть]

Кнопка "Перейти к тарифам" переключает на вкладку `subscription`.

### 4. Обновление PricingPlans на лендинге

Файл: `src/components/landing/PricingPlans.tsx` -- строки с ФИС ФРДО и Отчетами 1-ПК/1-ПО обновить: доступны начиная с `professional`, а не только `maximum`.

---

## Технические детали

### Файлы для изменения:

1. **`src/constants/subscriptionPlans.ts`**
   - `free.limits.maxCourses`: 1 -> 3
   - `free.enabledCategories`: добавить все категории
   - `start.limits.maxCourses`: 3 -> 10
   - `standard.limits.maxCourses`: 10 -> 30
   - `professional.limits.maxCourses`: 30 -> 50
   - `professional.limits.storageBytes`: 21474836480 -> 53687091200 (50 GB)
   - `professional.enabledCategories`: добавить `'frdo'`
   - Добавить новые boolean-поля в `PlanLimits`: `frdoEnabled`, `reportsEnabled`
   - professional и maximum: `frdoEnabled: true`, `reportsEnabled: true`

2. **`src/components/organization/OrgSidebar.tsx`**
   - Убрать условия `isEnabled(...)` из рендера кнопок -- показывать все пункты меню всегда
   - Добавить состояние для AlertDialog (upgradeDialogOpen, blockedFeatureName)
   - В `handleTabClick` проверять `isEnabled(category)`: если false -- открывать диалог вместо переключения вкладки
   - Добавить компонент AlertDialog в конец sidebar

3. **`src/components/landing/PricingPlans.tsx`**
   - Строка "ФИС ФРДО": `p === 'maximum'` -> `p === 'professional' || p === 'maximum'`
   - Строка "Отчеты 1-ПК / 1-ПО": аналогично
   - Обновить `featureDescriptions` для этих строк: minPlan -> "Профессионал"

4. **`src/hooks/useOrgFeatures.ts`**
   - Логика `enabledCategories` по-прежнему определяет, включена ли категория. Но в sidebar мы будем показывать все пункты и проверять `isEnabled` только при клике.

5. **Миграция БД**: Не требуется -- все лимиты хранятся в коде, а триггер `trg_sync_storage_limit` синхронизирует storage на основе плана.

