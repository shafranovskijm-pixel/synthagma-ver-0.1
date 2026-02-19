

# Онбординг для кабинета компании

## Что делаем

Добавляем пошаговый онбординг-диалог при первом входе в кабинет компании. Используем уже существующий компонент `OnboardingDialog` и паттерн с `onboarding_completed` из `profiles`.

---

## 1. Шаги онбординга (в `src/constants/onboardingSteps.ts`)

Добавляем массив `companyOnboardingSteps`:

| Шаг | Иконка | Заголовок | Описание | Подсветка |
|---|---|---|---|---|
| welcome | Sparkles | Добро пожаловать! | Обзор кабинета компании | -- |
| employees | Users | Сотрудники | Как добавлять и импортировать сотрудников | `[data-onboarding='employees']` |
| planning | ClipboardList | Планирование | Как создавать планы обучения | `[data-onboarding='planning']` |
| documents | FileText | Документы | Где смотреть договоры и счета | `[data-onboarding='documents']` |
| reminders | Bell | Напоминания | Как работают напоминания о переобучении | `[data-onboarding='reminders']` |

---

## 2. Навигационные кнопки в сайдбаре (`CompanyDashboard.tsx`)

Добавить `data-onboarding` атрибуты к кнопкам бокового меню, чтобы `OnboardingHighlight` мог их подсветить:

```tsx
<button data-onboarding={tab.id} ...>
```

---

## 3. Логика онбординга (`CompanyDashboard.tsx`)

По аналогии с `useOrganizationDashboard` и `useStudentDashboard`:

- При загрузке проверить `profiles.onboarding_completed` для текущего пользователя
- Если `false` -- показать `OnboardingDialog`
- При закрытии -- записать `onboarding_completed = true` в `profiles`
- При нажатии «Перейти к разделу» -- переключить на соответствующую вкладку

---

## 4. Затронутые файлы

| Файл | Действие |
|---|---|
| `src/constants/onboardingSteps.ts` | Добавить `companyOnboardingSteps` |
| `src/pages/CompanyDashboard.tsx` | Добавить `data-onboarding` атрибуты, состояние онбординга, `OnboardingDialog` |

Никаких изменений в базе данных не требуется -- поле `onboarding_completed` в `profiles` уже существует.

