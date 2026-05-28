## Диагноз (по логам и коду)

Я проверил edge-функции и логи за последние 3 часа. Нашёл **3 разные проблемы**, которые маскируют друг друга и выглядят как «AI не генерирует».

### 1. `generate-lesson-content` отдаёт 401 / 403 части пользователей
В `supabase/functions/generate-lesson-content/index.ts:42-53` стоит проверка:
```ts
const { data: roleData } = await supabaseAuth
  .from('user_roles').select('role').eq('user_id', user.id).single();
if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
  return 403 "Insufficient permissions";
}
```
- `.single()` падает если у юзера **несколько ролей** (а админы и владельцы часто имеют 2+ роли).
- Сотрудники организации (`org_staff` с правом `courses.manage`, `content_manager`, `sales_manager`) не имеют записи `organization` в `user_roles` → получают 403, кнопка «Сгенерировать» молча падает.
- Если access-token истёк за время сессии — `auth.getUser()` возвращает null → 401 «Invalid authentication» (видно в логах: 2 × 401 за последние 30 минут).

### 2. GigaChat-Pro закончились токены, но fallback работает
В `_shared/gigachat-client.ts`: при 402 от GigaChat-Pro код перебирает `GIGACHAT_MODEL_CHAIN` (Max, Plus, Lite). По логам `Success with model: GigaChat-Max` — генерация в итоге проходит, но **с задержкой 10–30 секунд** на каждый 402 (3 slot × 4 модели). Пользователю кажется, что «висит».

### 3. Lovable AI Gateway вернул 402 (`Payment required, please add credits`)
Это финальный fallback. Если GigaChat весь упадёт — генерация умрёт окончательно с непонятной ошибкой.

---

## План изменений

### A. `supabase/functions/generate-lesson-content/index.ts` — расширить авторизацию
1. Заменить `.single()` на `.maybeSingle()` + проверять через **массив ролей** (`select('role')` без `.single()`).
2. Разрешить помимо `organization`/`admin` ещё:
   - пользователей с записью в `org_staff` где `is_active = true` (любая активная роль сотрудника организации);
   - пользователей с правом `courses.manage` через RPC `has_org_staff_permission(user_id, 'courses.manage')`.
3. При 401 от `auth.getUser()` — добавить чёткое сообщение `«Сессия истекла, обновите страницу и войдите снова»` вместо сухого `"Invalid authentication"`.

### B. `src/utils/handleSupabaseError.ts` — маппинг AI-ошибок
Добавить распознавание:
- `"402"` / `"Payment required"` / `"All AI channels exhausted"` → «AI-кредиты закончились. Свяжитесь с администратором для пополнения GigaChat / Lovable AI».
- `"Insufficient permissions"` → «У вас нет прав на генерацию контента. Запросите у владельца организации право "Управление курсами".»
- `"Сессия истекла"` → «Войдите заново и повторите попытку».
- `"[MODERATION]"` → «GigaChat отклонил запрос по модерации. Переформулируйте тему урока.».

### C. `src/hooks/useLessonEditor.ts`, `useLessonMedia.ts`, `useBulkContentGenerator.ts`, `BlockEditorMain.tsx`
Заменить вывод сырого `error.message` через `toast.error(...)` на `toast.error(getErrorMessage(error))` — чтобы все 4 точки вызова показывали человеческие сообщения из (B).

### D. Админ-страница диагностики AI (`/admin` → вкладка «AI-настройки»)
Найти существующий компонент проверки AI (`devToolsData.ts:244` уже регистрирует `generate-lesson-content`). Добавить кнопку **«Проверить балансы»**, которая:
1. Дёргает `generate-lesson-content` с тестовым промптом `{ lessonTitle: "ping", lessonType: "test", courseTitle: "test" }`.
2. Показывает: какой slot ответил, какая модель сработала (Pro / Max / Plus / Lite / Lovable-AI fallback), время ответа.
3. Если все 402 — красная плашка «Пополните GigaChat или Lovable AI».

### E. Что НЕ трогаю
- Логику `gigachat-client.ts` (slot pool, model chain) — она работает корректно.
- Сами AI-ключи `GIGACHAT_AUTH_KEY*` (это решает только пользователь, пополнив баланс у Сбера).
- `verify_jwt = false` для функций.

---

## Что от вас нужно после фикса
Если после изменений всё равно «не генерирует» — откройте `/admin` → «AI-настройки» → «Проверить балансы», и пришлите мне результат. Он покажет, где именно затык: токены, права или сеть.