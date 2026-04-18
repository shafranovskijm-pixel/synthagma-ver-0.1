

## Проблема
Ошибка `No organization` при отправке внешнего договора. Источник — RPC `create_external_contract_signature`: она вызывает `current_organization_id()`, которая смотрит только в `profiles.organization_id`. У текущего пользователя там NULL — он связан с организацией через `org_staff` (или владелец, у которого профильное поле не заполнено).

При этом сама страница `/organization` работает корректно и знает свой `organizationId` — он уже передаётся пропом в `ExternalContractUploader`. Просто RPC его игнорирует и выводит свой.

## Решение

### 1. RPC `create_external_contract_signature` — fallback логика
- Добавить параметр `p_organization_id uuid DEFAULT NULL`.
- Логика определения организации внутри RPC:
  1. Если `p_organization_id` передан → проверить, что пользователь действительно член этой организации (через `profiles.organization_id` ИЛИ `org_staff`).
  2. Иначе fallback: `current_organization_id()` → `org_staff WHERE user_id = auth.uid()`.
- Если ничего не найдено — выбросить понятную ошибку с подсказкой.

### 2. Клиент `ExternalContractUploader.tsx`
- Передавать `p_organization_id: organizationId` в RPC явно (он уже есть в пропсах).

### 3. Бонус — улучшить `current_organization_id()` (безопасно)
- Добавить fallback на `org_staff`: сначала ищем в `profiles`, если NULL — берём из `org_staff` (LIMIT 1, по самой ранней записи).
- Это чисто аддитивно: где раньше возвращался NULL — теперь может вернуться валидный orgId. Существующие 137 RLS-политик от этого только начнут пропускать тех, кого раньше отбивали по ошибке. Риск минимальный, но улучшит UX в десятках мест.

## Файлы
- Миграция: `CREATE OR REPLACE FUNCTION create_external_contract_signature` + `CREATE OR REPLACE FUNCTION current_organization_id` с fallback на `org_staff`.
- `src/components/signing/ExternalContractUploader.tsx` — передать `p_organization_id` в RPC.

## Этапы
1. Миграция (две функции).
2. Правка клиента.
3. Проверка: повторно отправить тот же договор — ошибка должна уйти.

