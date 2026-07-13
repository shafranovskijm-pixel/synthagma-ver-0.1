## Проблема

Клиент видит только «Edge Function returned a non-2xx status code» — общий текст от Supabase SDK. Настоящий текст ошибки (например «Ученик с email … уже существует», «Не заполнено ФИО», «Логин занят») уходит в теле ответа, но `supabase.functions.invoke` не парсит его и возвращает `FunctionsHttpError` с обобщённым сообщением.

Дополнительно в `register-student` часть ошибок молча теряется (`user_roles.insert` без обработки, ошибка FRDO валит весь запрос, `createUser` мог висеть до тайм-аута шлюза).

Проверка данных для клиента `study@exd.ru` (org «ИЦ ГОРЭЛТЕХ»): пользователь `Кузин Никита Алексеевич` на самом деле был создан на сервере (auth + profile + role), но клиент увидел ошибку и создал его повторно — отсюда впечатление «не работает».

## Что сделаю

### 1. `src/utils/safeInvoke.ts` — читать тело ошибки

Когда `supabase.functions.invoke` возвращает `FunctionsHttpError` (non-2xx), достать тело через `error.context.json()` / `.text()` и подставить `body.error` в `Error.message`. Это единая точка — исправит показ ошибок во всех местах, где используется `safeInvoke` (создание учеников, импорт, компании, сотрудники охраны труда и т. д.).

Псевдокод:
```text
if (error instanceof FunctionsHttpError) {
  const body = await error.context.json().catch(() => null);
  const msg = body?.error || body?.message || error.message;
  return { data: null, error: new Error(msg) };
}
```

### 2. `supabase/functions/register-student/index.ts` — уже частично поправлено, доуточнить

Текущие правки на месте (валидация полей, тайм-аут 20с на createUser, откат auth-пользователя при ошибке профиля, «мягкая» ошибка FRDO). Добавлю:

- `user_roles.insert` заменить на `upsert(onConflict: 'user_id,role')`, чтобы повторный вызов не падал с 23505.
- Если auth-пользователь с таким логином уже был создан, но профиль отсутствует (текущий случай Кузина) — возвращать понятный текст «Ученик уже создан ранее, обновите список».
- Логировать `[register-student]` перед каждым шагом (org lookup / rpc / createUser / profile / role / frdo), чтобы будущие сбои можно было точно локализовать по логам.

### 3. `src/hooks/useStudentManagement.ts` — использовать `getErrorMessage`

Заменить `toast.error(error.message || "Ошибка создания ученика")` на `toast.error(getErrorMessage(error, "Ошибка создания ученика"))` — там уже есть маппинг типовых кодов (23505 → «уже существует» и т. п.).

### 4. Проверка

- Через `curl_edge_functions` дернуть `register-student` с пустым `full_name` → ожидаем 400 + «Не заполнены обязательные поля: ФИО».
- Дернуть с уже существующим `custom_login` → ожидаем 400 + «Логин … уже занят».
- Дернуть повторно после успешного создания → ожидаем понятный ответ, не «non-2xx».

## Что НЕ трогаю

- Сам поток создания (auth → profile → role) — работает.
- Другие места, которые уже вызывают `register-student` — они автоматически получат нормальные тексты через фикс `safeInvoke`.
- UI формы добавления ученика.
