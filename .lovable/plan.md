

## Все функции доступны на всех тарифах

### Что меняется
Разница между тарифами — только в числовых лимитах (курсы, ученики, обученных/мес, хранилище). Все boolean-функции включены на всех планах.

### Файлы

**1. `src/constants/subscriptionPlans.ts`**
- Во всех планах (free, start, standard, professional, maximum) установить все boolean-поля в `true`: `aiEnabled`, `aiAudioEnabled`, `courseSettings`, `documentChecklist`, `videoIdentification`, `branding`, `frdoEnabled`, `reportsEnabled`
- Все планы получают полный список `enabledCategories` (включая `documents`, `journals`, `frdo`, `library`, `labor_safety`, `webinars`)

**2. `src/components/landing/PricingPlans.tsx`**
- Все `featureRows` с boolean-значениями всегда возвращают `true`
- В `featureDescriptions` обновить `minPlan` на `"Бесплатный"` для всех функций
- Убрать хардкод-проверки типа `p === 'professional' || p === 'maximum'` — всё `true`

### Числовые лимиты остаются как есть
| | Free | Старт | Стандарт | Проф | Макс |
|---|---|---|---|---|---|
| Курсы | 3 | 15 | 30 | 50 | ∞ |
| Ученики | 10 | 100 | 200 | 1000 | ∞ |
| Обуч/мес | 10 | 60 | 100 | 500 | ∞ |
| Хранилище | 100 МБ | 3 ГБ | 10 ГБ | 50 ГБ | 100 ГБ |

