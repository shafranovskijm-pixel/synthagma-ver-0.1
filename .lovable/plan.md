
## Анализ проблемы

Смотрю скриншот: ошибка `No organization: пользователь не привязан к организации (profiles/org_staff)`. То есть мой обновлённый RPC реально вызвался, но текущий пользователь НЕ найден ни в `profiles.organization_id = X`, ни в `org_staff.organization_id = X` — для того `organizationId`, что передаётся пропом из страницы /organization.

Пользователь намекает на правильную вещь: **возможно, `organizationId`, который страница `/organization` передаёт в `ExternalContractUploader`, не совпадает с тем, к чему пользователь реально привязан.** Например, страница работает в режиме "Войти как организация" / View As Company / админская выборка `fallback org` — и orgId оттуда левый.

## Что нужно проверить (план)

### 1. Откуда страница /organization берёт `organizationId`
- Найду компонент `CounterpartiesSection` и его родителя.
- Посмотрю, как туда прокидывается `organizationId` (хук `useOrganization`, контекст, локальный стейт админа).

### 2. Связь пользователя с организацией в БД
- Через `supabase--read_query` посмотрю:
  - `SELECT user_id, organization_id, email FROM profiles WHERE user_id = <текущий>` 
  - `SELECT user_id, organization_id, role FROM org_staff WHERE user_id = <текущий>`
  - `SELECT id, name FROM organizations WHERE id = <тот orgId, что передаётся>`

### 3. Логика "Синтагма / Компании / Ученики"
Пользователь говорит — на скриншоте сверху видны кнопки `Синтагма | КОМПАНИИ | УЧЕНИКИ`. Это переключатели типа получателя. Сейчас RPC `create_external_contract_signature` всегда ставит `recipient_type = 'admin_sintagma'`. Это правильно для вкладки "Синтагма", но если пользователь переключится на "Компании" или "Ученики", той же кнопкой загрузки — получатель должен быть другой.

**План:**
- Расширить RPC параметром `p_recipient_type` (`admin_sintagma` / `company` / `student`) и опционально `p_recipient_user_id` / `p_company_id`.
- Передавать активную вкладку из `CounterpartiesSection` в `ExternalContractUploader`.
- Внутри RPC — использовать соответствующее значение.

## Решение (по этапам)

### Этап A — Диагностика (СНАЧАЛА это)
1. Прочитать `CounterpartiesSection.tsx` и его родителя — понять источник `organizationId`.
2. Через `supabase--read_query` сверить связку user ↔ org для текущего пользователя.
3. Понять — это баг неправильного orgId или баг RPC.

### Этап B — Фикс orgId (если выявится несоответствие)
- Если страница работает в режиме "view as company / impersonation" — не использовать тот orgId, а брать `current_organization_id()` от auth-сессии.
- Альтернатива: ослабить проверку членства — если пользователь админ платформы (`has_role admin`), разрешить любой `p_organization_id`.

### Этап C — Поддержка получателей "Синтагма / Компания / Ученик"
- Расширить `ExternalContractUploader`: пропс `recipientMode: 'admin_sintagma' | 'company' | 'student'` + опц. `recipientId`, `recipientEmail`, `recipientName`.
- Расширить RPC: `p_recipient_type`, `p_recipient_user_id`, `p_recipient_email`, `p_recipient_name`. CHECK constraint на `recipient_type` уже включает эти три значения (проверю).
- В `CounterpartiesSection` пробрасывать активную вкладку в загрузчик.

## Файлы (примерно)
- `src/components/organization/tabs/documents/CounterpartiesSection.tsx` — пробрасывать активный таб + источник orgId.
- `src/components/signing/ExternalContractUploader.tsx` — `recipientMode` + UI выбора получателя для company/student.
- Миграция: `CREATE OR REPLACE FUNCTION create_external_contract_signature` с новыми параметрами + допуск админа платформы.

## Этапы релиза
1. **Сначала диагностика** (запросы к БД + чтение компонентов) — определить корневую причину.
2. **Фикс orgId** для текущего сценария — чтобы загрузка заработала здесь и сейчас.
3. **Расширение на Компании / Ученики** — добавить выбор получателя.

После approve начну с **Этапа 1 (диагностика)**, и сразу перейду к **Этапу 2 (фикс)** — без ожидания дополнительного подтверждения. Этап 3 (получатели Компания/Ученик) — после.
