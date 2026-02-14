

# Глобальный план оптимизации кодовой базы

Полный план всех оставшихся улучшений, сгруппированный по приоритетам. Выполняется за один проход без пауз.

---

## Фаза 1: Завершение Context-миграции (OrgSidebar + OrgDashboardHeader)

OrgSidebar (217 строк, 12 props) и OrgDashboardHeader (103 строки, 8 props) до сих пор получают props вручную из OrganizationDashboard.tsx.

**Действия:**
- OrgSidebar.tsx -- убрать interface, подключить `useOrgDashboard()`
- OrgDashboardHeader.tsx -- убрать interface, подключить `useOrgDashboard()`
- OrganizationDashboard.tsx -- убрать передачу ~20 props, файл сократится до ~100 строк

---

## Фаза 2: Декомпозиция CourseLearning.tsx (2758 строк -- самый большой файл)

Разбить на:

| Новый файл | Содержимое | ~Строк |
|---|---|---|
| `src/hooks/useCourseLearning.ts` | Вся бизнес-логика: загрузка курса, навигация по урокам, прогресс, тест-логика | ~600 |
| `src/hooks/useTestLesson.ts` | Логика тестирования: ответы, таймер, отправка, результат | ~300 |
| `src/components/course-learning/LessonContent.tsx` | Рендер контента: текст, видео, аудио, слайдер, изображение | ~400 |
| `src/components/course-learning/TestView.tsx` | Интерфейс тестирования: вопросы, варианты, результат | ~350 |
| `src/components/course-learning/LessonSidebar.tsx` | Боковая панель со списком уроков | ~150 |
| `src/components/course-learning/CourseCompletionScreen.tsx` | Экран завершения курса | ~100 |

**Результат:** CourseLearning.tsx сократится с 2758 до ~500 строк.

---

## Фаза 3: Декомпозиция StudentDashboard.tsx (1131 строк)

Разбить на:

| Новый файл | Содержимое | ~Строк |
|---|---|---|
| `src/hooks/useStudentDashboard.ts` | Загрузка курсов, чат, настройки, логика | ~350 |
| `src/components/student/StudentCoursesList.tsx` | Список курсов с карточками | ~200 |
| `src/components/student/StudentChatPanel.tsx` | AI-чат панель | ~200 |
| `src/components/student/StudentSettingsPanel.tsx` | Панель настроек студента | ~150 |

**Результат:** StudentDashboard.tsx сократится до ~300 строк.

---

## Фаза 4: Декомпозиция CourseBuilder.tsx (1196 строк)

Вынести оставшуюся логику:

| Новый файл | Содержимое | ~Строк |
|---|---|---|
| `src/hooks/useCourseBuilder.ts` | Состояние, загрузка/сохранение курса, AI-генерация, импорт | ~500 |
| `src/components/course-builder/CourseBuilderHeader.tsx` | Шапка с кнопками сохранения, импорта, AI | ~100 |
| `src/components/course-builder/LessonTypeSelector.tsx` | Панель выбора типа урока (text, video, test...) | ~80 |

**Результат:** CourseBuilder.tsx сократится до ~400 строк.

---

## Фаза 5: Декомпозиция средних компонентов

### ContractGenerator.tsx (789 строк)
- `src/hooks/useContractGenerator.ts` -- логика генерации (~300 строк)
- Компонент сократится до ~450 строк

### JournalEditor.tsx (734 строки)
- `src/hooks/useJournalEditor.ts` -- CRUD-логика, валидация (~300 строк)
- Компонент сократится до ~400 строк

### FRDOManager.tsx (725 строк)
- `src/hooks/useFRDOManager.ts` -- загрузка данных, фильтрация, экспорт (~300 строк)
- Компонент сократится до ~400 строк

---

## Фаза 6: Расширение DevTools

Обновить devToolsData.ts:
- Все новые оптимизации отмечены как "applied"
- Добавить новые pending-рекомендации для будущих улучшений (тесты, e2e)
- Обновить метрики: TOTAL_LINES, LARGEST_FILES, QUALITY_METRICS
- Добавить метрику "Context Coverage" (% компонентов на Context)
- Убрать forwardRef из CodeMapTab, HealthTab, ApiMonitorTab

---

## Сводная таблица всех изменений

| # | Файл | Действие |
|---|---|---|
| 1 | `OrgSidebar.tsx` | Context вместо 12 props |
| 2 | `OrgDashboardHeader.tsx` | Context вместо 8 props |
| 3 | `OrganizationDashboard.tsx` | Убрать ~20 props |
| 4 | `hooks/useCourseLearning.ts` | Новый -- логика из CourseLearning |
| 5 | `hooks/useTestLesson.ts` | Новый -- тест-логика |
| 6 | `course-learning/LessonContent.tsx` | Новый -- рендер контента |
| 7 | `course-learning/TestView.tsx` | Новый -- тест UI |
| 8 | `course-learning/LessonSidebar.tsx` | Новый -- сайдбар уроков |
| 9 | `course-learning/CourseCompletionScreen.tsx` | Новый -- экран завершения |
| 10 | `CourseLearning.tsx` | Рефакторинг: 2758 -> ~500 |
| 11 | `hooks/useStudentDashboard.ts` | Новый -- логика дашборда студента |
| 12 | `student/StudentCoursesList.tsx` | Новый -- список курсов |
| 13 | `student/StudentChatPanel.tsx` | Новый -- чат |
| 14 | `student/StudentSettingsPanel.tsx` | Новый -- настройки |
| 15 | `StudentDashboard.tsx` | Рефакторинг: 1131 -> ~300 |
| 16 | `hooks/useCourseBuilder.ts` | Новый -- логика билдера |
| 17 | `course-builder/CourseBuilderHeader.tsx` | Новый -- шапка |
| 18 | `course-builder/LessonTypeSelector.tsx` | Новый -- выбор типа |
| 19 | `CourseBuilder.tsx` | Рефакторинг: 1196 -> ~400 |
| 20 | `hooks/useContractGenerator.ts` | Новый -- логика контрактов |
| 21 | `ContractGenerator.tsx` | Рефакторинг: 789 -> ~450 |
| 22 | `hooks/useJournalEditor.ts` | Новый -- логика журналов |
| 23 | `JournalEditor.tsx` | Рефакторинг: 734 -> ~400 |
| 24 | `hooks/useFRDOManager.ts` | Новый -- логика ФРДО |
| 25 | `FRDOManager.tsx` | Рефакторинг: 725 -> ~400 |
| 26 | `devToolsData.ts` | Обновление метрик и рекомендаций |
| 27 | `CodeMapTab.tsx` | Убрать forwardRef, добавить Context Coverage |
| 28 | `HealthTab.tsx` | Убрать forwardRef |
| 29 | `ApiMonitorTab.tsx` | Убрать forwardRef |

**Общий итог:** ~15 новых файлов, ~14 изменённых. Суммарное сокращение крупных файлов: ~4500 строк перенесены в модульные хуки и подкомпоненты. Ни один файл не будет превышать 500 строк (кроме SortableLessonItem -- 780, уже вынесен).

