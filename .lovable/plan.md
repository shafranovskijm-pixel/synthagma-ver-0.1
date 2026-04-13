

# Единый layout для всех страниц организации (Профиль, Настройки, Документы, Что нового, Помощь)

## Суть
Сейчас страницы «Профиль» и «Настройки» имеют собственный простой layout (стрелка назад + заголовок), а «Что нового» — вообще отдельная публичная страница. Нужно привести их все к единому виду главной страницы организации: `OrgSidebar` слева, шапка с обложкой/логотипом, подвал и dropdown-профиль.

## Что будет сделано

### 1. Создать общий layout-компонент `OrgPageLayout`
Новый компонент `src/components/organization/OrgPageLayout.tsx`, который оборачивает контент страницы в:
- `OrgSidebar` слева (уже есть, переиспользуем)
- Шапка с обложкой, логотипом, тарифом, уведомлениями, dropdown-профилем (как в `OrgDashboardHeader` и `OrganizationDocuments`)
- Под-заголовок с иконкой и названием страницы
- `OrgDashboardFooter` снизу

Это устранит дублирование кода между `OrganizationDocuments`, `OrganizationProfile`, `OrganizationSettings`.

### 2. Переделать `OrganizationProfile.tsx`
- Убрать собственный header (стрелка + «Профиль»)
- Обернуть в `OrgDashboardProvider` + `OrgPageLayout`
- Содержимое (табы: Мой профиль, Брендирование, Уведомления и т.д.) остается внутри

### 3. Переделать `OrganizationSettings.tsx`
- Убрать собственный header
- Обернуть в `OrgDashboardProvider` + `OrgPageLayout`
- Содержимое (табы: Разделы меню, Касса, Настройки ЛК и т.д.) остается внутри

### 4. Переделать `OrganizationDocuments.tsx`
- Заменить вручную скопированный header на `OrgPageLayout`
- Упростить код, убрать дублирование

### 5. Создать страницу `WhatsNewOrg.tsx` (или встроить в роутинг)
- Страница «Что нового» в контексте организации: `/organization/whats-new`
- Тот же layout (`OrgPageLayout`), внутри — список обновлений платформы
- Публичная `/whats-new` остается как есть

### 6. Создать страницу «Помощь» `/organization/help`
- Layout через `OrgPageLayout`
- Контент: ссылки на поддержку (Telegram), FAQ, документация

### 7. Добавить пункты в `OrgSidebar`
Внизу сайдбара (или в секции утилит) добавить иконки-кнопки для:
- Профиль → `/organization/profile`
- Настройки → `/organization/settings`
- Документы → `/organization/documents`
- Что нового → `/organization/whats-new`
- Помощь → `/organization/help`

Эти пункты будут визуально отделены от основной навигации (курсы, ученики и т.д.).

### 8. Обновить роутинг
Добавить маршруты `/organization/whats-new` и `/organization/help` в `App.tsx`.

## Файлы

| Файл | Изменение |
|---|---|
| `src/components/organization/OrgPageLayout.tsx` | **Новый** — общий layout с sidebar, header, footer |
| `src/pages/OrganizationProfile.tsx` | Обернуть в `OrgPageLayout`, убрать свой header |
| `src/pages/OrganizationSettings.tsx` | Обернуть в `OrgPageLayout`, убрать свой header |
| `src/pages/OrganizationDocuments.tsx` | Упростить через `OrgPageLayout` |
| `src/pages/OrganizationWhatsNew.tsx` | **Новый** — «Что нового» в layout организации |
| `src/pages/OrganizationHelp.tsx` | **Новый** — страница помощи |
| `src/components/organization/OrgSidebar.tsx` | Добавить иконки навигации (Профиль, Настройки, Документы, Что нового, Помощь) |
| `src/App.tsx` | Новые маршруты |

Миграций не требуется.

