

# Единый layout для кабинета организации — загрузка без перезагрузки страницы

## Проблема
Каждая страница организации (`/organization`, `/organization/course/:id`, `/organization/student/:id`, и т.д.) создает свой собственный `OrgDashboardProvider`. При переходе, например, с дашборда на курс — весь экран пропадает, показывается полноэкранный спиннер, заново загружаются все данные организации (брендинг, лимиты, курсы). В админке такого нет, потому что админка — одна страница с вкладками, а у организации — отдельные роуты.

## Решение
Создать общий layout-компонент `OrgLayout`, который оборачивает все `/organization/*` роуты через вложенные маршруты React Router (`<Route element={<OrgLayout />}>`). Этот layout содержит единственный `OrgDashboardProvider` + `OrgSidebar`, а дочерние страницы рендерятся через `<Outlet />`. При навигации между страницами сайдбар остается на месте, провайдер не перемонтируется.

## Файлы

### 1. Создать `src/components/organization/OrgLayout.tsx` (~60 строк)
- Загрузка `organizationId` (та же логика, что сейчас дублируется в каждой странице)
- `OrgDashboardProvider` — один на все страницы
- `OrgSidebar` — всегда на месте
- `<Outlet />` для дочерних страниц
- При загрузке `organizationId` — показывать спиннер **внутри layout** (сайдбар уже виден)

### 2. Изменить `src/routes/organizationRoutes.tsx`
- Обернуть `/organization/*` роуты во вложенный `<Route element={<OrgLayout />}>` с `<Outlet />`
- Страницы, которые используют OrgSidebar (dashboard, course, student) — дочерние
- Страницы с OrgSettingsSidebar (profile, settings, documents) — тоже дочерние, но layout различается внутри самих страниц

```text
<Route path="/organization" element={<OrgLayout />}>
  <Route index element={<OrganizationDashboard />} />
  <Route path="course/:courseId" element={<OrganizationCourseDetails />} />
  <Route path="student/:studentId" element={<OrganizationStudentDetails />} />
  <Route path="profile" element={<OrganizationProfile />} />
  <Route path="settings" element={<OrganizationSettings />} />
  <Route path="documents" element={<OrganizationDocuments />} />
  <Route path="whats-new" element={<OrganizationWhatsNew />} />
</Route>
```

### 3. Упростить `OrganizationCourseDetails.tsx`
- Убрать внешний компонент-обертку с загрузкой `organizationId` и `OrgDashboardProvider` (это теперь в OrgLayout)
- Убрать `OrgSidebar` из JSX (уже в layout)
- Убрать дублирование хедера — использовать `useOrgDashboard()` напрямую
- Спиннер загрузки курса — **внутри** content area, хедер и сайдбар остаются

### 4. Упростить `OrganizationStudentDetails.tsx`
- Аналогично: убрать обертку, `OrgDashboardProvider`, `OrgSidebar`
- Спиннер загрузки ученика — внутри content area

### 5. Упростить `OrganizationDashboard.tsx`
- Убрать `OrgDashboardProvider` (уже в layout)
- `OrgSidebar` убрать (уже в layout)

### 6. Упростить `OrgPageLayout.tsx`
- Убрать `OrgDashboardProvider` и загрузку `organizationId` (уже в layout)
- Получать `organizationId` из контекста OrgLayout

### 7. Передача `organizationId` через контекст
- Добавить в `OrgLayout` контекст `OrgLayoutContext` с `organizationId`
- Или проще: получать `organizationId` из `useOrgDashboard()` (уже есть в контексте dashboard)

## Результат
- Переход на курс/ученика: сайдбар остается, хедер остается, загружается только контент
- Данные организации загружаются один раз при входе в `/organization/*`
- При возврате назад — мгновенно, без перезагрузки

## Объем
~7 файлов, основная работа — создание OrgLayout и удаление дублированного кода из страниц.
