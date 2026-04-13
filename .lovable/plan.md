

# Добавить боковое меню (OrgSidebar) на страницы Курса и Документов

## Суть
На страницах `/organization/course/:courseId` и `/organization/documents` отсутствует боковая навигация (`OrgSidebar`), которая есть на главной странице дашборда. Нужно добавить её на обе страницы.

## Что будет сделано

### 1. `OrganizationCourseDetails.tsx`
- Изменить layout с `flex flex-col` на `flex` (горизонтальный)
- Добавить `<OrgSidebar />` слева
- Обернуть основной контент в `<main className="flex-1 flex flex-col min-w-0 lg:ml-[88px]">` — точно как на главной странице

### 2. `OrganizationDocuments.tsx`
- Аналогичное изменение: добавить `<OrgSidebar />` и обернуть контент в `<main>` с отступом `lg:ml-[88px]`

## Файлы

| Файл | Изменение |
|---|---|
| `src/pages/OrganizationCourseDetails.tsx` | Добавить `OrgSidebar`, изменить layout на flex с sidebar |
| `src/pages/OrganizationDocuments.tsx` | Добавить `OrgSidebar`, изменить layout на flex с sidebar |

