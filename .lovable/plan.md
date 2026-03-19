

## Диагноз

Сейчас все ссылки формируются через `window.location.origin` — то есть зависят от домена, с которого сидит админ. Если админ зашёл с `синтагма.рф`, ученик получит письмо со ссылкой на `синтагма.рф`. Если с `synthagma-bloom.lovable.app` — ссылка будет на lovable.app.

Дополнительно: whitelist в edge-функции `send-credentials` **не содержит `sintagma.com.ru`** — при отправке с этого домена письма будут отклоняться с ошибкой «Invalid login URL domain».

Аналогично `send-documents-reminder` — там whitelist вообще отсутствует, но ссылки всё равно зависят от текущего домена.

**Нужно**: все ссылки всегда указывают на основной домен `sintagma.com.ru`, независимо от того, откуда зашёл админ.

## План исправления

### 1. Создать утилиту `getBaseUrl()`
**Файл**: `src/utils/getBaseUrl.ts` (новый)

```typescript
export const getBaseUrl = () => {
  if (import.meta.env.DEV) return window.location.origin;
  return 'https://sintagma.com.ru';
};
```

### 2. Заменить `window.location.origin` на `getBaseUrl()` во всех файлах

Затронутые файлы (14 штук):
- `src/hooks/useStudentActions.ts` — отправка учётных данных, напоминания
- `src/hooks/useStudentDetailCard.ts` — напоминание о документах
- `src/components/organization/tabs/LinksTab.tsx` — копирование ссылок регистрации
- `src/components/organization/RegistrationLinksManager.tsx` — копирование ссылок
- `src/components/organization/dialogs/CompanyDetailDialog.tsx` — ссылка для входа
- `src/components/organization/LoginBrandingSettings.tsx` — URL брендированного логина
- `src/components/admin/sales/CommercialProposals.tsx` — ссылки на КП
- `src/components/admin/sales/ProposalPreview.tsx` — ссылка на КП
- `src/pages/Install.tsx` — ссылка на установку
- `src/hooks/useAuth.tsx` — redirect при регистрации

### 3. Обновить whitelist в `send-credentials`
**Файл**: `supabase/functions/send-credentials/index.ts`

Добавить `sintagma.com.ru` в `allowedPatterns`:
```
/^https:\/\/(www\.)?sintagma\.com\.ru/,
```

### 4. Задеплоить обновлённую edge-функцию

---

**Итого**: 1 новый файл, ~14 файлов с заменой `window.location.origin` → `getBaseUrl()`, 1 edge-функция с обновлённым whitelist + деплой.

