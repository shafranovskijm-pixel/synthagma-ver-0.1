

# Исправление предупреждений здоровья проекта

## Текущее состояние
- **22 файла > 800 строк** (без архивных и types.ts)
- **organization/ — 47K строк в 131 файле**
- Топ-3 кандидата на декомпозицию: `DocumentsTab` (1440), `CourseDetailsModal` (1412), `LaborSafetyStudentDetailCard` (1279)

## План: декомпозиция 3 крупнейших файлов

### 1. DocumentsTab.tsx (1440 → ~300)
Извлечь логику и подразделы:
- `useDocumentsTab.ts` — хук с состоянием, загрузкой billing-документов, requisites
- `DocumentsNavSidebar.tsx` — боковое меню навигации по разделам
- `BillingDocumentsSection.tsx` — раздел «Синтагма» (счета, акты)
- `CounterpartiesSection.tsx` — раздел «Контрагенты»
- `ConstructorSection.tsx` — раздел конструктора (договоры, протоколы, сертификаты, дипломы)
- `OrdersSection.tsx` — раздел приказов
- Основной `DocumentsTab.tsx` остаётся оркестратором (~300 строк)

### 2. CourseDetailsModal.tsx (1412 → ~200)
Извлечь вкладки модального окна в подкомпоненты:
- `useCourseDetailsModal.ts` — хук с загрузкой курса, учеников, настроек
- `CourseOverviewTab.tsx` — обзор курса (статистика, прогресс)
- `CourseStudentsTab.tsx` — список учеников курса
- `CourseSettingsTab.tsx` — настройки курса (ФРДО, видео, доступ)
- `CourseDocumentsTab.tsx` — документы и отчёты курса
- `CourseRemindersGroupsTab.tsx` — напоминания и группы
- Основной `CourseDetailsModal.tsx` — Dialog + Tabs оркестрация (~200 строк)

### 3. LaborSafetyStudentDetailCard.tsx (1279 → ~200)
Извлечь секции карточки:
- `useLaborSafetyStudent.ts` — хук с загрузкой данных студента, курсов, идентификации
- `LSStudentPersonalTab.tsx` — личные данные, СНИЛС, ИНН
- `LSStudentCoursesTab.tsx` — курсы и прогресс
- `LSStudentIdentificationTab.tsx` — видео-идентификация
- `LSStudentCredentialsTab.tsx` — логин/пароль
- Основной файл — Dialog + Tabs (~200 строк)

### 4. Обновить devToolsData.ts
- Обновить счётчики и рекомендации: отметить 3 новых декомпозиции как «Применено»
- Обновить `large-files-count`: «20 файлов > 800 строк» (снижено с 22)
- Обновить `org-components-size`: отразить уменьшение

## Файлы

| Действие | Файлы |
|---|---|
| Новые (DocumentsTab) | `useDocumentsTab.ts`, `DocumentsNavSidebar.tsx`, `BillingDocumentsSection.tsx`, `CounterpartiesSection.tsx`, `ConstructorSection.tsx`, `OrdersSection.tsx` |
| Новые (CourseDetailsModal) | `useCourseDetailsModal.ts`, `CourseOverviewTab.tsx`, `CourseStudentsTab.tsx`, `CourseSettingsTab.tsx`, `CourseDocumentsTab.tsx` |
| Новые (LaborSafety) | `useLaborSafetyStudent.ts`, `LSStudentPersonalTab.tsx`, `LSStudentCoursesTab.tsx`, `LSStudentIdentificationTab.tsx`, `LSStudentCredentialsTab.tsx` |
| Рефакторинг | `DocumentsTab.tsx`, `CourseDetailsModal.tsx`, `LaborSafetyStudentDetailCard.tsx` |
| Обновление | `devToolsData.ts` |

