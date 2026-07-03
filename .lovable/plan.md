
## Что делаем

Превращаем строку менеджера в админке в полноценную **карточку менеджера** с его личными инструментами. Плюс отвечаю про статус рассылки.

---

## 1. Клик по менеджеру → большая карточка (Sheet)

В `SalesManagersList` добавляю кнопку **«Открыть карточку»** (или клик по имени). Открывается правый Sheet `ManagerProfileDrawer` с вкладками:

### Вкладка «Доступ»
То, что сейчас в карточке: логин, пароль, ссылка входа, кнопки Copy / Telegram / WhatsApp / Email / Сбросить пароль / Войти как / Деактивировать.

### Вкладка «Рассылка (SMTP)»
- Личный переключатель: **режим отправки** — «общий пул» (по умолчанию) / «мои ящики».
- Таблица закреплённых за менеджером ящиков из `email_sender_pool` (фильтр по новому полю `assigned_manager_id`). Кнопки: закрепить свободный ящик, открепить, включить/выключить, вставить app-password, дневной лимит.
- Кнопка **«Проверить SMTP»** — прогоняет тест-отправку через существующий edge `send-smtp-test` для выбранного ящика и показывает результат (host/port/auth).
- Мини-статистика: отправлено сегодня / лимит / последняя ошибка.

### Вкладка «Скрипт звонка»
- Полный редактор скрипта холодного звонка **по менеджеру** (переопределяет общий из `src/constants/coldCallScript.ts`).
- Секции: Вступительный монолог, Вопросы, Возражения (с follow-ups), Закрытие.
- Каждый пункт — inline-редактор (title + text + список followUps).
- Кнопки: «Сохранить», «Сбросить к дефолту», «Скопировать из общего».
- Хранение: новая колонка `sales_managers.script_overrides jsonb` (структура повторяет `ScriptTab[]`). `CompanyDrawer` при загрузке подмешивает override текущего менеджера в `openingMonolog` / `coldCallScript`.

### Вкладка «Статистика»
Переносим сюда содержимое `ManagerStatsDialog` (звонки, КП, конверсия за период).

---

## 2. БД (одна миграция)

```sql
alter table public.sales_managers
  add column if not exists script_overrides jsonb,
  add column if not exists email_sender_mode text not null default 'pool'
    check (email_sender_mode in ('pool','personal'));

alter table public.email_sender_pool
  add column if not exists assigned_manager_id uuid references public.sales_managers(id) on delete set null;

create index if not exists email_sender_pool_assigned_manager_idx
  on public.email_sender_pool(assigned_manager_id);
```
RLS/GRANT-ы у обеих таблиц уже настроены — просто расширяем существующие политики (админ пишет всё, менеджер видит только своё).

`pick_next_email_sender` дополняю необязательным аргументом `p_manager_id`: если у менеджера `email_sender_mode='personal'` — берём LRU только среди `assigned_manager_id = p_manager_id`, иначе фолбэк на общий пул.

---

## 3. Ответ по текущей рассылке (сразу в чате, без кода)

Сейчас в `email_sender_pool` **20 ящиков `@yi.mannni.com` загружены с app-паролями**, но **все `is_active = false`** и **0 отправок**. То есть пароли, которые вы прислали, сохранены, но пул не включён — рассылка не идёт. В админке в разделе «Пул отправителей» их можно включить тумблером; и я добавлю в новой карточке менеджера кнопку «Проверить SMTP» на каждый ящик, чтобы автоматически убедиться, что Google Workspace принимает app-password, и только валидные включать. Если хотите — сразу после карточки прогоню автопроверку и включу те, что прошли.

---

## Файлы

**Новые**
- `src/components/admin/sales/ManagerProfileDrawer.tsx` — Sheet с вкладками
- `src/components/admin/sales/ManagerScriptEditor.tsx` — редактор скрипта
- `src/components/admin/sales/ManagerSmtpTab.tsx` — SMTP-вкладка (использует `EmailSenderPoolManager` в отфильтрованном режиме)
- `supabase/migrations/<ts>_manager_script_and_smtp.sql`

**Правки**
- `src/components/admin/sales/SalesManagersList.tsx` — кнопка «Открыть карточку», рендер Drawer
- `src/hooks/useSalesManager.ts` — типы `script_overrides`, `email_sender_mode`, метод `updateManagerScript`
- `src/components/admin/sales/CompanyDrawer.tsx` — при монтировании подмешивает `script_overrides` менеджера в текст скрипта и караоке
- `src/constants/coldCallScript.ts` — экспорт хелпера `mergeScriptOverrides(base, overrides)`
- `supabase/functions/send-smtp-test/index.ts` — уже есть, вызываем; при отсутствии — добавляю аналогичный маленький edge

Клик «Войти как», «История», «Сбросить пароль» переезжают внутрь Drawer как отдельные кнопки — старые внешние кнопки убираем, чтобы список был компактнее.
