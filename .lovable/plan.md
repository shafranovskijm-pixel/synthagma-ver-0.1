

# Брендирование доступно с тарифа «Стандарт»

## Проблема

Сейчас брендирование скрыто только для бесплатного тарифа (`isFreePlan`). Нужно ограничить доступ также для тарифа «Старт» и добавить эту функцию в таблицу тарифов на лендинге.

## Изменения

### 1. Добавить `branding` в лимиты тарифов

**Файл:** `src/constants/subscriptionPlans.ts`

- Добавить поле `branding: boolean` в интерфейс `PlanLimits`
- Установить `branding: false` для `free` и `start`
- Установить `branding: true` для `standard`, `professional`, `maximum`

### 2. Добавить «Брендирование» в таблицу тарифов на лендинге

**Файл:** `src/components/landing/PricingPlans.tsx`

- Добавить строку «Брендирование» в массив `featureRows` (после «Видеоидентификация»)
- Значение берётся из `SUBSCRIPTION_PLANS[p].limits.branding`

### 3. Ограничить доступ к брендированию в настройках

**Файл:** `src/components/organization/tabs/SettingsTab.tsx`

- Заменить проверку `!isFreePlan` на проверку `hasBranding` для трёх секций:
  - «Брендирование» (строка 322)
  - «Брендирование страницы входа» (строка 559)
  - Можно также для «Настройки личного кабинета ученика» (строка 582)
- `hasBranding` = план не `free` и не `start` (т.е. standard+)

### Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/constants/subscriptionPlans.ts` | Добавить `branding` в `PlanLimits`, задать значения |
| `src/components/landing/PricingPlans.tsx` | Добавить строку «Брендирование» в featureRows |
| `src/components/organization/tabs/SettingsTab.tsx` | Заменить `!isFreePlan` на проверку `plan >= standard` для брендинг-секций |

