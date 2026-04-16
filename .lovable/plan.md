

# Унификация тарифов + новые фичи в планах

## Изменения

### 1. Константы (`src/constants/subscriptionPlans.ts`)
- **Старт**: цена `3490` → `4490`
- Добавить в `PlanLimits`: `webinarsEnabled`, `videoServicePlus` (>2ГБ), `trainersEnabled` (3D)
- **Вебинары**: Professional ✓, Maximum ✓ (остальные ✗)
- **Видеосервис+**: Professional ✓, Maximum ✓
- **3D-тренажёры**: только Maximum ✓
- Добавить `webinars` в `enabledCategories` Professional/Maximum (уже есть)
- Добавить `3d_trainers` в `enabledCategories` Maximum

### 2. Главная — PricingPlans (`src/components/landing/PricingPlans.tsx`)
- Добавить строки в `featureRows`:
  - «Вебинары» — Professional+
  - «Видеосервис+» — Professional+ (описание: загрузка видео >2 ГБ)
  - «3D-тренажёры» — только Maximum
- Добавить описания в `featureDescriptions`
- Обновить цену Старт (берётся из константы, обновится автоматически)

### 3. Презентация — тарифы (`src/pages/PlatformPresentation.tsx`)
- Обновить цену Старт: `3 490` → `4 490`
- Добавить в features Professional: «Вебинары», «Видеосервис+»
- Добавить в features Maximum: «Вебинары», «Видеосервис+», «3D-тренажёры»
- Стиль «Видеосервис+» и «3D-тренажёры» — выделить акцентным цветом (как ФИС ФРДО+)

### 4. Сравнительная таблица в презентации (строка 85)
- Обновить стартовую цену: `3 490 ₽/мес` → `4 490 ₽/мес`

## Файлы

| Файл | Действие |
|------|----------|
| `src/constants/subscriptionPlans.ts` | Цена Старт, новые лимиты |
| `src/components/landing/PricingPlans.tsx` | Новые строки фич |
| `src/pages/PlatformPresentation.tsx` | Обновить карточки тарифов |

