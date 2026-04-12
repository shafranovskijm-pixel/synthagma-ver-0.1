

# Исправления раздела «Компании»

## Три проблемы

1. **Кнопка «Войти как компания» не работает** — на карточках сохраняется просто `companyId` строкой, а `CompanyDashboard` ожидает JSON с `userId` и `companyName`. Нужно сохранять данные в том же формате, что и в `CompanyDetailDialog`.

2. **Нет кнопки «Скрыть компании» на самой странице** — переключатель есть только в настройках профиля. Пользователь хочет кнопку прямо в шапке раздела «Компании».

3. **Виджеты статистики (Компании / Договоры / Оплачено / Не оплачено) не скрываются** — при скрытии раздела «Компании» эти карточки должны тоже исчезать.

## Что будет сделано

### Файл: `src/components/organization/CompaniesManager.tsx`

1. **Исправить `handleViewAsCompany`** — вместо `localStorage.setItem('orgViewAsCompany', companyId)` сохранять JSON:
```typescript
localStorage.setItem('orgViewAsCompany', JSON.stringify({
  companyId: company.id,
  companyName: company.name,
  userId: company.user_id,
}));
```
Для этого функция будет принимать объект `company` целиком, а не только `companyId`.

2. **Добавить кнопку «Скрыть раздел»** в шапку (рядом с «Добавить компанию»). По нажатию — обновляет `menu_settings.showCompanies = false` в таблице `organizations` и редиректит на главную вкладку организации. Для этого нужно:
   - Принять `organizationId` (уже есть как проп)
   - Добавить кнопку с иконкой `EyeOff` и текстом «Скрыть раздел»
   - При клике: обновить `menu_settings` в БД и перенаправить

3. **Передать `company` объект** в `handleViewAsCompany` вместо `company.id` — обновить оба места вызова (grid и list).

### Файл: `src/hooks/useCompaniesManager.ts` (или тип Company)

Убедиться, что тип `Company` содержит `user_id` — нужно для передачи в localStorage. Проверю наличие поля.

### Виджеты статистики

`StatsGrid` уже рендерится внутри `CompaniesManager`, который целиком скрывается при `showCompanies === false` через навигацию в `OrgSidebar`. Поэтому отдельно скрывать виджеты не нужно — они исчезнут вместе с разделом.

## Без миграций БД

Все изменения — чисто UI. Поле `menu_settings` уже JSONB и принимает `showCompanies`.

