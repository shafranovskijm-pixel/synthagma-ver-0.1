

# Карточка ученика → полноэкранная страница

## Суть
Превратить `StudentDetailCard` из модального окна (Dialog) в полноценную страницу `/organization/student/:studentId` — по аналогии с `OrganizationCourseDetails`: сайдбар слева, шапка с обложкой, вертикальное меню разделов, подвал.

## Что будет сделано

### 1. Новая страница `src/pages/OrganizationStudentDetails.tsx`
- Скопировать структуру из `OrganizationCourseDetails.tsx`:
  - `OrgSidebar` слева
  - Шапка: top bar (логотип, тариф, профиль-меню), hero-баннер с обложкой, sub-header с именем ученика и статусом онлайн
  - Двухколоночный layout: **вертикальное меню слева** (Личное дело, Идентификация, Курсы, Документы, Активность, Чат) с cyan hover (`hover:text-primary hover:bg-primary/10`)
  - Контент справа — те же табы (`ProfileTab`, `IdentificationTab`, `CoursesTab`, `DocumentsTab`, `ActivityTab`, `ChatTab`)
  - `OrgDashboardFooter` внизу
- Загрузка данных ученика по `studentId` из URL (profiles + enrollments)

### 2. Добавить маршрут в `src/App.tsx`
- `/organization/student/:studentId` → `OrganizationStudentDetails`

### 3. Изменить навигацию: клик по ученику → navigate вместо Dialog
- В `useStudentDetailCard.ts`: `viewStudent` вызывает `navigate(/organization/student/${student.id})` вместо открытия модалки
- Или: в компонентах, где вызывается `handleViewStudent`, заменить на `navigate`
- `DialogsContainer.tsx`: убрать `StudentDetailCard` из диалогов (оставить как fallback или удалить)

### 4. Сохранить вложенные диалоги
- Preview документа, согласие на ПД, FRDO export — оставить как Dialog внутри новой страницы

## Файлы

| Файл | Изменение |
|---|---|
| `src/pages/OrganizationStudentDetails.tsx` | **Новый** — полноэкранная страница ученика |
| `src/App.tsx` | Добавить маршрут `/organization/student/:studentId` |
| `src/hooks/useStudentDetailCard.ts` | `viewStudent` → navigate вместо setState |
| `src/components/organization/dialogs/DialogsContainer.tsx` | Убрать `StudentDetailCard` dialog |

Миграций не требуется.

