
# План улучшений кодовой базы — v2

Актуальное состояние после рефакторинга. Отмечено что сделано (✅) и что осталось.

---

## ✅ Выполнено

| Задача | Результат |
|---|---|
| Context-миграция OrgSidebar, OrgDashboardHeader | Оба на `useOrgDashboard()`, 0 props |
| OrganizationDashboard.tsx | 121 строка (было ~800) |
| Декомпозиция CourseBuilder.tsx | 149 строк + `useCourseBuilder.ts` |
| Декомпозиция CourseLearning.tsx | 281 строка + `useCourseLearning.ts` |
| Декомпозиция StudentDashboard.tsx | 175 строк + `useStudentDashboard.ts` |
| Декомпозиция ContractGenerator.tsx | 90 строк + `useContractGenerator.ts` |
| Декомпозиция JournalEditor.tsx | 106 строк + `useJournalEditor.ts` |
| Декомпозиция FRDOManager.tsx | 80 строк + `useFRDOManager.ts` |
| Unit-тесты для хуков | 5 тестовых файлов |

---

## Фаза 7: Декомпозиция оставшихся крупных компонентов

| Файл | Строк | Действие |
|---|---|---|
| `CompaniesManager.tsx` | 636 | Вынести логику в `useCompaniesManager.ts`, UI-части в подкомпоненты |
| `StudentDetailCard.tsx` | 451 | Разбить на табы: `StudentInfoTab`, `StudentDocsTab`, `StudentHistoryTab` |
| `SortableLessonItem.tsx` | 413 | Вынести preview-рендер каждого типа в отдельные компоненты |

---

## Фаза 8: Расширение тестового покрытия

| Задача | Описание |
|---|---|
| Тесты для `useContractGenerator` | Генерация, валидация, форматирование |
| Тесты для `useOrganizationDashboard` | Загрузка данных, фильтры, действия |
| Тесты для `useCompaniesManager` | CRUD компаний |
| Тесты для `useJournalEditor` | CRUD записей журнала |
| Тесты для `useFRDOManager` | Фильтрация, экспорт |
| Тесты для утилит | `frdoExcelExport`, `credentials`, `courseBuilderHelpers` |

---

## Фаза 9: Производительность

| Задача | Описание |
|---|---|
| React.memo для тяжёлых списков | `StudentsTab`, `CoursesTab` — мемоизировать строки таблиц |
| Виртуализация длинных списков | Внедрить `react-window` для таблиц >100 строк (студенты, ФРДО) |
| Оптимизация ре-рендеров OrgDashboard | Разделить контекст на `OrgDataContext` + `OrgUIContext` |
| Lazy import тяжёлых компонентов | `ContractGenerator`, `JournalEditor`, `EducationDocumentsJournal` — dynamic import |

---

## Фаза 10: Обновление DevTools-метрик

| Задача | Описание |
|---|---|
| Обновить `devToolsData.ts` | Актуальные LoC, количество файлов |
| Добавить метрику «Тестовое покрытие» | Количество тестов и покрытых хуков |
| Добавить pending-рекомендации | Виртуализация, разделение контекста, e2e-тесты |
| Отметить выполненные оптимизации | Все фазы 1-5 как «applied» |

---

## Фаза 11: Качество кода и DX

| Задача | Описание |
|---|---|
| Типизация — убрать `any` | Поиск всех `as any` и замена на точные типы |
| Консистентный error handling | Единый паттерн `try/catch` + toast + логирование |
| Константы вместо magic strings | Вынести названия табов, статусы, роли в `constants/` |
| JSDoc для публичных хуков | Документация параметров и возвращаемых значений |

---

## Сводка приоритетов

| Приоритет | Фаза | Сложность | Влияние |
|---|---|---|---|
| 🔴 Высокий | Фаза 7 (крупные компоненты) | Средняя | Читаемость, поддержка |
| 🟡 Средний | Фаза 8 (тесты) | Низкая | Стабильность |
| 🟡 Средний | Фаза 9 (производительность) | Средняя | UX при >500 студентов |
| 🟢 Низкий | Фаза 10 (DevTools) | Низкая | DX |
| 🟢 Низкий | Фаза 11 (качество) | Низкая | Долгосрочная поддержка |
