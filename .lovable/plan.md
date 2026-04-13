

# Продающая заглушка для вебинаров + ограничение по тарифу

## Что делаем

### 1. Убрать `webinars` из enabledCategories для тарифов free, start, standard

**Файл:** `src/constants/subscriptionPlans.ts`

Удалить `'webinars'` из массива `enabledCategories` для планов `free`, `start`, `standard`. Оставить только в `professional` и `maximum`.

### 2. Продающая заглушка в CoursesTab

**Файл:** `src/components/organization/tabs/CoursesTab.tsx`

При выборе вкладки «Вебинары», если `!dashboard.isEnabled('webinars')`, вместо `<WebinarsManager>` показать карточку в стиле `PaymentsTab`:

- Градиентный хедер с иконкой Radio
- Заголовок: «Вебинары и онлайн-трансляции»
- Подзаголовок: «Проводите живые занятия и сохраняйте записи для повторного просмотра»
- Сетка 2x3 с возможностями (без упоминания Kinescope):
  - Онлайн-трансляции — проводите занятия в реальном времени
  - Запись вебинаров — автоматическое сохранение записей для студентов
  - Привязка к курсам — студенты курса автоматически получают доступ
  - Планирование — назначайте дату и время заранее
  - Управление участниками — контроль доступа к трансляциям
  - Встроенный плеер — просмотр прямо на платформе без переходов
- Внизу: бейдж «Доступно с тарифа Профессиональный» + кнопка «Перейти к тарифам»

### 3. Когда вебинары включены — промо-текст в пустом состоянии

**Файл:** `src/components/organization/WebinarsManager.tsx` (строка 244)

Заменить текст «Создайте первый вебинар через Kinescope или добавьте внешнюю ссылку» на «Создайте первый вебинар — проводите онлайн-занятия и сохраняйте записи для студентов».

### 4. Добавить «Вебинары» в таблицу сравнения тарифов

**Файл:** `src/components/organization/SubscriptionTab.tsx`

Добавить строку `{ label: "Вебинары", getValue: (plan) => plan.enabledCategories.includes('webinars'), format: (v: boolean) => v }` в массив `FEATURE_COMPARISON`.

## Затрагиваемые файлы
- `src/constants/subscriptionPlans.ts` — убрать webinars из 3 планов
- `src/components/organization/tabs/CoursesTab.tsx` — заглушка
- `src/components/organization/WebinarsManager.tsx` — текст empty state
- `src/components/organization/SubscriptionTab.tsx` — строка в сравнении

