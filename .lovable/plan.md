
# Обновление тарифов и создание новых страниц функций

## Сводка изменений

### 1. Изменения в тарифной сетке (`src/constants/subscriptionPlans.ts`)

- **Стандарт**: включить `documentChecklist: true` и `videoIdentification: true`
- **Бесплатный, Старт, Стандарт**: добавить `'services'` в `enabledCategories` (магазин курсов доступен всем)
- **Профессиональный**: убрать `'frdo'` из `enabledCategories` (ФИС ФРДО только в Максимальном)

### 2. Обновление таблицы тарифов на главной (`src/components/landing/PricingPlans.tsx`)

- **"Магазин курсов"** -- новая строка, доступна всем тарифам (всегда `true`), со ссылкой на `/feature/course-store`
- **"Чек-лист документов"** -- добавить ссылку на `/feature/document-checklist`
- **"Охрана труда"** -- добавить ссылку на `/feature/labor-safety`
- **"ФИС ФРДО"** -- изменить логику: только `maximum`
- **"Отчеты 1-ПК / 1-ПО"** -- изменить логику: только `maximum`
- **"API для CRM"** -- новая строка, только `maximum`
- **"Видеоидентификация"** -- теперь доступна с `standard` (подтягивается из `limits`)
- **"Чек-лист документов"** -- теперь доступен с `standard` (подтягивается из `limits`)

### 3. Новые страницы

#### `/feature/labor-safety` -- `src/pages/FeatureLaborSafety.tsx`
Страница модуля "Охрана труда":
- Описание изолированной системы обучения охране труда
- Синхронизация профилей, массовое зачисление
- Генерация протоколов с подписями комиссии
- Доступен на тарифах Профессиональный и Максимальный

#### `/feature/course-store` -- `src/pages/FeatureCourseStore.tsx`
Страница "Магазин курсов":
- Описание маркетплейса курсов между организациями
- Каталог с поиском, заявки на покупку
- Доступен с бесплатного тарифа

#### `/feature/document-checklist` -- `src/pages/FeatureDocumentChecklist.tsx`
Страница "Чек-лист документов":
- Описание функции сбора и хранения документов от слушателей
- Акцент на упрощение проверок Рособрнадзора
- Загрузка, контроль полноты, уведомления
- Доступен с тарифа Стандарт

### 4. Маршруты (`src/App.tsx`)
Добавить 3 новых маршрута:
- `/feature/labor-safety` -- `FeatureLaborSafety`
- `/feature/course-store` -- `FeatureCourseStore`
- `/feature/document-checklist` -- `FeatureDocumentChecklist`

---

## Техническая часть

### `subscriptionPlans.ts` -- конкретные изменения

```text
free.enabledCategories: добавить 'services'
start.enabledCategories: добавить 'services'  (уже нет -- проверить)

standard.limits.documentChecklist: false -> true
standard.limits.videoIdentification: false -> true

professional.enabledCategories: убрать 'frdo'
(frdo остаётся только в maximum)
```

### `PricingPlans.tsx` -- featureRows

```text
Добавить: { label: "Магазин курсов", link: "/feature/course-store", getValue: () => true }
Изменить: "Чек-лист документов" -- добавить link: "/feature/document-checklist"
Изменить: "Охрана труда" -- добавить link: "/feature/labor-safety"
Изменить: "ФИС ФРДО" -- getValue: p === 'maximum'
Изменить: "Отчеты 1-ПК / 1-ПО" -- getValue: p === 'maximum'
Добавить: { label: "API для CRM", getValue: p === 'maximum' }
```

### Новые страницы
Все 3 страницы следуют существующему паттерну: header с логотипом, hero-секция, секции с описанием, CTA, Footer. Используют framer-motion анимации (`fadeUp`, `stagger`).
