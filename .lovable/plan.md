

# Исправление: добавление сотрудника из кабинета компании

## Проблема

Edge-функция `register-student` на строке 43 допускает только роли `organization` и `admin`. Роль `company` отклоняется с ошибкой 403. Из-за этого кнопка «Добавить сотрудника» в кабинете компании не работает.

## Решение

Обновить `supabase/functions/register-student/index.ts`:

1. Добавить роль `company` в список разрешённых (строка 43)
2. Для роли `company` -- получить `company_id` и `organization_id` из таблицы `companies` (по `user_id`)
3. Автоматически подставлять `organization_id` и `company_id` из данных компании, чтобы компания не могла зарегистрировать сотрудника в чужой организации

## Изменения в коде

### `supabase/functions/register-student/index.ts`

**Строка 43** -- расширить проверку роли:
```typescript
if (!roleData || !['organization', 'admin', 'company'].includes(roleData.role)) {
```

**После строки 60** -- для роли `company` получить привязку:
```typescript
let effectiveOrgId = organization_id;
let effectiveCompanyId = company_id;

if (roleData.role === 'company') {
  const { data: companyData } = await supabaseAdmin
    .from('companies')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!companyData) {
    return error 403 "Company not found for this user";
  }

  effectiveOrgId = companyData.organization_id;
  effectiveCompanyId = companyData.id;
}
```

**Строка 79** -- проверка org принадлежности для company:
```typescript
if (roleData.role === 'company') {
  // уже подставили из companyData, дополнительная проверка не нужна
} else if (roleData.role !== 'admin' && callerProfile?.organization_id !== effectiveOrgId) {
  return error 403;
}
```

Далее по коду использовать `effectiveOrgId` и `effectiveCompanyId` вместо параметров из тела запроса.

## Затронутые файлы

| Файл | Действие |
|---|---|
| `supabase/functions/register-student/index.ts` | Добавить роль `company` + автоопределение org_id/company_id |

Никаких изменений в БД или фронтенде не требуется.

