## Что сейчас не так

Я прошёл цепочку «настройка в профиле → edge-функция → база» и нашёл **три проблемы**, из-за которых функция фактически не работает:

### 1. Компонент `OrgCredentialsSettings` нигде не подключён
Файл `src/components/organization/OrgCredentialsSettings.tsx` существует и красиво нарисован, но `rg -n "OrgCredentialsSettings"` находит его только внутри самого файла. В `OrgProfileTab.tsx` и других местах профиля он не импортируется — значит в кабинете организации этой настройки **просто нет в UI**. Пользователь не может ей воспользоваться.

### 2. Edge-функция пишет пароль в открытом виде
В таблице `organization_credentials.login_password` пароль хранится **зашифрованным** (`pgp_sym_encrypt`), читается через RPC `get_decrypted_org_credentials` → `decrypt_password()`. Это подтверждается и memory-правилом «PII and passwords encrypted at rest».

А `supabase/functions/update-org-credentials/index.ts` (строка 138-141) делает:
```ts
.from('organization_credentials').update({ login_password: new_password })
```
— то есть кладёт plain text прямо в зашифрованную колонку. После такого UPDATE:
- `decrypt_password()` либо упадёт с ошибкой, либо вернёт мусор;
- в карточке у админа («Учётные данные организации») пароль перестанет показываться корректно;
- ровно та ситуация, что мы сейчас разбирали с `regressofiya@yandex.ru` — карточка показывает одно, в `auth.users` другое.

### 3. Проверка владельца по email сломается на первом же изменении email
Edge-функция (строка 81) проверяет доступ так:
```ts
if (user.email !== credentials.login_email) → 403
```
Если организация уже хоть раз меняла email через Supabase Auth (или его поменял админ), `user.email` и `credentials.login_email` разъезжаются — и функция вернёт «Нет доступа к этой организации» даже легитимному владельцу. Правильнее проверять связь через `profiles.organization_id = current_user`.

## Что делаю

### Шаг 1. Подключить компонент в профиле организации
В `src/components/organization/tabs/OrgProfileTab.tsx` добавить блок «Учётные данные для входа» (карточка с `<OrgCredentialsSettings organizationId={...} />`) под существующим блоком профиля. Это вернёт настройку в UI.

### Шаг 2. Починить edge-функцию `update-org-credentials`
Изменения в `supabase/functions/update-org-credentials/index.ts`:

1. **Проверять владение через profiles, а не через email-сравнение:**
```ts
const { data: profile } = await supabaseAdmin
  .from('profiles').select('organization_id').eq('user_id', user.id).single();
if (!profile || profile.organization_id !== organization_id) → 403
```
2. **Шифровать пароль в `organization_credentials`** через RPC, а не писать plain text. Использовать `pgp_sym_encrypt` через служебную RPC (см. шаг 3).
3. Сохранить порядок: сначала обновить `auth.users` (через `supabaseAdmin.auth.admin.updateUserById`), и только при успехе — обновить `organization_credentials`. Если auth-обновление упало — credentials не трогаем. Если credentials-обновление упало после auth — логируем и возвращаем понятную ошибку (auth уже изменён, надо вручную пересинхронизировать).

### Шаг 3. SQL-миграция: RPC для шифрованной записи
Добавить SECURITY DEFINER функцию `update_org_credentials_encrypted(p_organization_id uuid, p_email text, p_password text)`, которая:
- проверяет, что вызывающий — админ или владелец этой организации;
- шифрует пароль через ту же логику, что используется при создании (`pgp_sym_encrypt(p_password, <key>)`), чтобы `decrypt_password()` потом успешно его прочитал;
- обновляет `login_email` и/или `login_password` атомарно.

Edge-функция будет звать эту RPC вместо прямого UPDATE.

### Шаг 4. Ручная проверка после деплоя
Сценарии:
1. Войти под организацией → Профиль → блок «Учётные данные» виден, текущие email/пароль подгружены.
2. Сменить только пароль → выйти → войти с новым паролем → успех. Открыть настройки снова — пароль показывается корректно (значит расшифровка работает).
3. Сменить email → выйти → войти с новым email и тем же паролем → успех.
4. Открыть карточку организации в админке — там тот же email и пароль, что задала организация (никакого рассинхрона).

## Технические детали (для разработчика)

- Файлы:
  - `src/components/organization/tabs/OrgProfileTab.tsx` — добавить секцию + импорт.
  - `supabase/functions/update-org-credentials/index.ts` — переписать логику проверки и записи credentials.
  - Новая SQL-миграция — RPC `update_org_credentials_encrypted`.
- Ключ шифрования возьмём из существующего механизма (тот же, что используется в `decrypt_password`/при первичном создании credentials в `generate-org-credentials`), чтобы избежать рассинхрона ключей.
- RLS на `organization_credentials` не трогаем — пишем через SECURITY DEFINER RPC от имени service role.
- Никаких клиентских изменений в `OrgCredentialsSettings.tsx` не требуется — он уже корректно работает с edge-функцией; меняется только серверная часть.

## Чего НЕ делаю
- Не трогаю админскую функцию `reset-org-password` и `update-org-email` — они сейчас работают и используются в кабинете админа отдельно.
- Не меняю формат хранения паролей и ключ шифрования.
- Не делаю отдельный «текущий пароль для подтверждения» — оставляю текущее поведение (организация уже залогинена, JWT — достаточная проверка). Если понадобится, добавим отдельным шагом.