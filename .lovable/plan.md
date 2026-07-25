# План: блокировка, отправка уведомлений и дубли писем

Три отдельные проблемы — исправляем end-to-end.

---

## 1. «Недостаточно прав» при блокировке ученика в кабинете организации

**Причина.** `public.set_student_blocked` разрешает вызов только:
- платформенному `admin`, либо
- пользователю с `has_org_staff_permission(caller, org, 'students.manage')`.

Владелец организации (`organizations.owner_id`) и профили с `role='organization'`, которые сами не заведены в `org_staff`, проверку не проходят — отсюда ошибка.

**Что делаем.** Миграция: расширить проверку в `set_student_blocked`, разрешив:
1. `has_role(caller,'admin')` — как сейчас;
2. `organizations.owner_id = caller` для организации ученика;
3. `profiles.role='organization' AND profiles.organization_id = _target_org` (админ‑аккаунт организации);
4. `has_org_staff_permission(caller, _target_org, 'students.manage')` — как сейчас.

Ошибку менять на `RAISE EXCEPTION USING MESSAGE='...', ERRCODE='42501'`, чтобы фронт мог отличать permission от других.

Фронт `useStudentDetailCard.handleToggleBlock` не меняем (он уже показывает `error.message`).

---

## 2. Bounce на `sgt103633@student.local` и «выдуманные» email

**Причина.** У учеников без реальной почты в `auth.users.email` лежит служебный `<login>@student.local`. `notify-course-completion` берёт этот email и отправляет письмо — Timeweb возвращает **Mail delivery failed / Unrouteable address**, копия падает на `support@sintagma.com.ru`.

Тот же паттерн уже фильтруется в `process-reminders` и `webinar-reminders-cron` (`endsWith('@student.local')`), но в `notify-course-completion` и в ручных «Отправить письмо» действиях из кабинета — нет.

**Что делаем.**

### 2.1. Хелпер `isRealEmail`
Добавить в `supabase/functions/_shared/notification-prefs.ts`:
```ts
export const isRealEmail = (e?: string|null) =>
  !!e && /@/.test(e) && !e.toLowerCase().endsWith('@student.local');
```

### 2.2. Фильтр в edge-функциях
Прогнать через `isRealEmail(studentEmail)` перед отправкой во всех местах, где адрес берётся из `auth.users`:
- `notify-course-completion`
- `notify-homework-graded`
- `notify-enrollment-request`
- `notify-order-status`, `notify-program-order`, `notify-course-order`
- `send-email` (если `to` заканчивается на `@student.local` — отдаём 200 `{skipped:'no_real_email'}`, чтобы не ретраить).

Если письмо пропущено — пишем `studentEmailSkipped='no_real_email'` в ответ, in‑app уведомление всё равно создаётся (`notifyStudent(force)` уже работает).

### 2.3. UI: попросить ввести реальную почту
В `ProfileTab.tsx` (карточка ученика) и в `StudentProfile.tsx` (ЛК самого ученика) добавить блок:
- если `auth email` заканчивается на `@student.local` **и** в `profiles` нет реальной почты →
  жёлтая карточка «Укажите email для получения уведомлений» + инпут + кнопка «Сохранить».
- Сохранение вызывает уже существующий `update-student-credentials` с `new_email`.
- В `useStudentDetailCard` хелпер `hasRealEmail` — прячем кнопку «Отправить документы на почту» / «Отправить письмо» при её отсутствии и показываем tooltip «Сначала добавьте email».

### 2.4. Диалог «Отправить письмо» из UI
Компоненты, где менеджер вручную нажимает «Отправить» (карточка ученика, документы, приглашения) — перед вызовом edge-функции проверяют `isRealEmail`; если нет — открывается тот же inline‑диалог «Введите email получателя», значение сохраняется в `profiles.contact_email` (новая колонка) и используется для рассылок.

Миграция: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;` + фильтр по формату. В edge‑функциях приоритет: `profiles.contact_email` → `auth.users.email` (если real).

---

## 3. Дубликаты писем и «поочередная» рассылка

Скриншот Outlook: 4 идентичных «Курс завершён: Рябцев Мих…» приходят одновременно на один ящик организации.

**Причины (обе бывают).**
1. **Дубли инвока.** `useCourseLearningFacade` вызывает `notify-course-completion` при каждом монтировании, когда `progress===100`. Быстрые повторные монтирования / StrictMode / переоткрытие вкладки → несколько инвоков за секунды. Rate‑limit пропускает, потому что орг-отправки идут с `skipRateLimit:true`.
2. **Дубли адресатов.** `org.email` совпадает с одним из `completion_notify_emails` — recipients не дедуплицируются.

**Что делаем.**

### 3.1. Серверная идемпотентность
- Новая таблица `notification_dedup_log`:
  - `key TEXT PRIMARY KEY`, `created_at TIMESTAMPTZ DEFAULT now()`
  - GRANT/RLS: только `service_role`.
- В `notify-course-completion` в начале обработки:
  ```
  key = `course-completion:${enrollment_id||user_id}:${course_id}`
  INSERT ... ON CONFLICT DO NOTHING RETURNING key;
  ```
  Если строки нет — уже отправляли, отвечаем `{success:true, deduped:true}` и выходим.
- Дневная авто‑очистка (cron 03:15 UTC) — `DELETE ... WHERE created_at < now() - interval '30 days'`.

Тот же приём для `notify-homework-graded` (`homework:${submission_id}:${status}`) и `notify-enrollment-request` (`enrollment-request:${enrollment_id}`).

### 3.2. Дедупликация адресатов
В `notify-course-completion`:
```
const recipients = Array.from(new Set(
  [org.email, ...extras].filter(isRealEmail).map(e => e.toLowerCase())
));
```

### 3.3. «Поочередно» между ящиками
Пул `email_sender_pool` уже LRU (`pick_next_email_sender` + `mark_email_sender_result`). Проверяем и фиксируем:
- В `sendPlatformEmail` **не** параллелим отправку внутри одного вызова функции — идём последовательно (уже так и есть).
- Между разными получателями в одном инвоке — задержка `send_delay_ms` из `email_send_state` (сейчас игнорируется в `sendPlatformEmail`). Добавляем `await sleep(delay)` между итерациями цикла recipients.
- Пишем `email_send_log` (уже есть таблица) на каждом sendPlatformEmail — для дашборда.

### 3.4. Клиентская защита от повторного вызова
В `useCourseLearningFacade` перед `safeInvoke('notify-course-completion',…)`:
- `sessionStorage` ключ `notified:${enrollment_id}` — второй вызов в одной вкладке пропускается;
- условие уже включает `just became 100%`, а не «остаётся 100%» — уточняем реф `notifiedRef` через `useRef<Set<string>>`.

---

## 4. Проверка end‑to‑end

Скрипт (playwright, headless) под `/tmp/browser/notifs/`:
1. Логин под test‑ученик с реальной почтой → пройти тестовый курс до 100% → убедиться, что `notify-course-completion` вернул `student.emailSent=true, deduped:false`; повторный ручной вызов → `deduped:true`.
2. Логин под ученика с `@student.local` → пройти курс → ответ: `student.skipped='no_real_email'`, в UI на карточке появилась плашка «Укажите email».
3. Организация: назначить `owner_id` пользователю; из UI нажать «Заблокировать» → toast «Ученик заблокирован», выход из аккаунта ученика при следующей проверке `is_user_blocked`.
4. `select count(*) from email_send_log where template_name='course_completion' and message_id like 'course-completion:<enrollment>:%'` → ровно 1 группа.
5. Проверить, что `pick_next_email_sender` возвращает разные ящики между последовательными вызовами (`select email from email_sender_pool order by last_used_at desc limit 5`).

---

## Технические детали / файлы

**Миграции**
- `set_student_blocked` — расширенная авторизация.
- `notification_dedup_log` + GRANT service_role + cron очистки.
- `profiles.contact_email TEXT`.

**Edge‑функции (после миграций)**
- `_shared/notification-prefs.ts` — export `isRealEmail`, `getPreferredEmail(userId)`.
- `notify-course-completion/index.ts` — dedup log, recipient dedup, `isRealEmail`, `send_delay_ms`.
- `notify-homework-graded`, `notify-enrollment-request`, `notify-order-status`, `notify-program-order`, `notify-course-order`, `send-email` — `isRealEmail`.
- Deploy: перечисленные функции.

**Фронт**
- `src/hooks/useStudentDetailCard.ts` — `hasRealEmail`, показ тултипов.
- `src/components/organization/student-detail/ProfileTab.tsx` — карточка «Укажите email».
- `src/pages/StudentProfile.tsx` — та же карточка для ученика.
- `src/hooks/course-learning/useCourseLearningFacade.ts` — `notifiedRef`/sessionStorage guard.

Никаких изменений тарифов, дизайна, storage.
