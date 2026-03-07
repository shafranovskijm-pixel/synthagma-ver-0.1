

## План

### 1. UsersManager — добавить кнопку «Войти как» для слушателей

**Файл:** `src/components/admin/UsersManager.tsx`

- В колонке «Действия» (строка 533-542) рядом с кнопкой удаления добавить кнопку «Войти как» (иконка `ExternalLink`) — только для пользователей с ролью `student`
- По клику: `localStorage.setItem('adminViewAsStudent', JSON.stringify({ userId, name, orgName }))` и `navigate('/student')` — аналогично `OrganizationDetailsView`
- В диалоге детальной карточки пользователя (строка 552+) добавить кнопку «Войти как ученик» в шапку диалога — тоже только для `student`
- Добавить импорт `useNavigate` и `ExternalLink`

### 2. OrganizationsManager — убрать кнопку «ИИ»

**Файл:** `src/components/admin/OrganizationsManager.tsx`

- Удалить `DropdownMenuItem` с «ИИ:» в обоих дропдаунах (строки 857-860 и 1056-1059)
- Удалить функцию `toggleAiProvider` и связанный импорт `Sparkles`, если больше нигде не используется

### Файлы для изменения:
1. `src/components/admin/UsersManager.tsx` — кнопка «Войти как» в таблице и диалоге
2. `src/components/admin/OrganizationsManager.tsx` — удаление пункта «ИИ» из дропдаунов

