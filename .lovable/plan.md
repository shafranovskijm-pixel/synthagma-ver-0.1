

# Исправление ошибок и дальнейшая декомпозиция кода

## 1. Исправление ошибки ref в HealthTab

В консоли отображается ошибка: "Function components cannot be given refs" для `HealthTab`. Это происходит потому, что Radix `TabsContent` пытается передать ref дочернему компоненту. Решение -- обернуть `HealthTab` и `CodeMapTab` в `React.forwardRef`.

**Файлы:** `src/components/admin/devtools/HealthTab.tsx`, `src/components/admin/devtools/CodeMapTab.tsx`

---

## 2. Вынос VideoPreviewInline и SliderLessonEditor из CourseBuilder

Компоненты `VideoPreviewInline` (~50 строк) и `SliderLessonEditor` (~100 строк) до сих пор определены внутри `CourseBuilder.tsx`. Нужно вынести их в отдельные файлы.

**Новые файлы:**
- `src/components/course-builder/VideoPreviewInline.tsx`
- `src/components/course-builder/SliderLessonEditor.tsx`

**Изменённый файл:** `src/pages/CourseBuilder.tsx` -- замена инлайн-определений на импорты.

---

## 3. Создание useOrganizationDashboard -- объединяющий хук

`OrganizationDashboard.tsx` содержит ~20 вызовов хуков (строки 39-171) и ~160 строк пробрасывания props в `DialogsContainer`. Создание объединяющего хука упростит основной компонент.

Хук `useOrganizationDashboard` объединит инициализацию всех под-хуков и вернёт единый объект состояния.

**Новый файл:** `src/hooks/useOrganizationDashboard.ts`
**Изменённый файл:** `src/pages/OrganizationDashboard.tsx` -- использование нового хука вместо ~130 строк инициализации.

---

## 4. Вынос OrgDashboardHeader

Header с условной логикой кнопок по вкладкам (строки 332-400) вынести в отдельный компонент.

**Новый файл:** `src/components/organization/OrgDashboardHeader.tsx`

---

## 5. Обновление рекомендаций в devToolsData.ts

Пометить оставшиеся реализованные пункты как "applied" и добавить новую рекомендацию о выполненном рефакторинге OrganizationDashboard.

**Файл:** `src/components/admin/devtools/devToolsData.ts`

---

## Сводка изменений

| Файл | Действие |
|---|---|
| `src/components/admin/devtools/HealthTab.tsx` | forwardRef |
| `src/components/admin/devtools/CodeMapTab.tsx` | forwardRef |
| `src/components/course-builder/VideoPreviewInline.tsx` | Новый |
| `src/components/course-builder/SliderLessonEditor.tsx` | Новый |
| `src/pages/CourseBuilder.tsx` | Убрать инлайн-компоненты, добавить импорты |
| `src/hooks/useOrganizationDashboard.ts` | Новый -- объединяющий хук |
| `src/components/organization/OrgDashboardHeader.tsx` | Новый -- header |
| `src/pages/OrganizationDashboard.tsx` | Рефакторинг -- использование нового хука и header |
| `src/components/admin/devtools/devToolsData.ts` | Обновление статусов |

