
## План: Добавить кнопку «Войти как компания» в карточке компании

### Что делаем

Добавляем в `CompanyDetailDialog` (вкладка «Действия») кнопку «Личный кабинет компании», которая работает по аналогии с «Войти как ученик» в админке — через localStorage сохраняем данные компании и открываем `/company` в новой вкладке.

### Механизм

Аналогично `adminViewAsStudent`, создаём ключ `orgViewAsCompany` в localStorage:
```json
{
  "companyId": "...",
  "companyName": "Компания ABC",
  "userId": "..." // user_id компании из таблицы companies
}
```

При открытии `/company` CompanyDashboard проверяет этот ключ и показывает баннер «Режим просмотра: Компания ABC» с кнопкой «Выйти» (возврат на `/organization`). Данные компании загружаются по `company.user_id` вместо текущего `auth.uid()`.

### Изменения

**1. `src/components/organization/dialogs/CompanyDetailDialog.tsx`**
- В секцию «Действия» (после кнопки «Зачислить на курсы», ~строка 352) добавить кнопку «Личный кабинет компании» с иконкой `Eye`
- По клику: сохраняем `orgViewAsCompany` в localStorage и открываем `/company` в новой вкладке (`window.open`)

**2. `src/pages/CompanyDashboard.tsx`**
- Добавить проверку `localStorage.getItem('orgViewAsCompany')` при загрузке
- Показывать баннер «Режим просмотра» (как у ученика) с кнопкой выхода
- В `useCompanyDashboard` нужно поддержать передачу `userId` для режима просмотра

**3. `src/hooks/useCompanyDashboard.ts`**
- Добавить необязательный параметр `viewAsUserId` 
- Если передан — использовать его вместо `user.id` для загрузки данных компании

### Файлы
- `src/components/organization/dialogs/CompanyDetailDialog.tsx`
- `src/pages/CompanyDashboard.tsx`
- `src/hooks/useCompanyDashboard.ts`
