

# Исправить применение индивидуальных лимитов в SubscriptionTab

## Проблема

В `SubscriptionTab.tsx` для отображения лимитов используется `currentPlanInfo.limits.*` — это **статические значения** тарифного плана из константы `SUBSCRIPTION_PLANS`. Индивидуальные настройки (`custom_max_courses`, `custom_max_students` и т.д.), которые хранятся в БД и корректно загружаются хуком `useSubscriptionLimits`, **игнорируются** при отображении.

Хук `useSubscriptionLimits` уже правильно мержит кастомные лимиты в `subscriptionLimits.limits`, но компонент берёт данные из другого источника.

## Решение

Заменить все обращения к `currentPlanInfo.limits.*` на `subscriptionLimits.limits.*` в местах отображения usage-метрик.

## Изменения в `src/components/organization/SubscriptionTab.tsx`

### 1. Пересчёт процентов (строки 226-231)
Заменить `currentPlanInfo.limits.maxCourses` → `subscriptionLimits.limits.maxCourses`, аналогично для `maxStudents`, `maxTrainedPerMonth`.

### 2. Отображение лимитов в карточках (строки 335, 349, 363, 377)
Заменить `currentPlanInfo.limits.maxCourses` → `subscriptionLimits.limits.maxCourses` и аналогично для остальных полей. Для хранилища: `currentPlanInfo.limits.storageBytes` → `subscriptionLimits.limits.storageBytes`.

### 3. Progress bars (строки 338, 352, 366)
Аналогично — использовать `subscriptionLimits.limits.*`.

Итого ~12 замен `currentPlanInfo.limits.` → `subscriptionLimits.limits.` в секции usage meters.

