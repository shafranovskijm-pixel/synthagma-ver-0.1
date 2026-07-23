## Что проверено (end-to-end)

Аудит всех настроек уведомлений (`notification_preferences`) и всех реальных путей отправки в приложении и edge-функциях.

### Что настраивается в UI

**Ученик** (`useStudentProfile.ts`), 5 типов × 3 канала:
`course_updates`, `webinar_reminder`, `homework`, `deadline_reminder`, `partner_changes` × `platform` / `browser` / `email`.

**Организация** (`OrgProfileTab.tsx`), 8 типов × 5 каналов:
`group_full`, `student_completed`, `webinar_reminder`, `homework`, `partner_changes`, `promo_expired`, `student_waiting`, `student_paid` × `platform` / `browser` / `email` / `telegram` / `app`.

### Что реально работает

| Канал/тип | Пишется в БД | Читается перед отправкой |
|---|---|---|
| `org_notifications` (in-app колокольчик организации) | да — 8 мест (заявки, доки, счета, идентификация, подписи) | **нет — переключатели не проверяются** |
| `admin_notifications` (in-app колокольчик админа) | да — 6 мест (программы, тарифы, партнёры, ФРДО, документы) | нет — нет UI-настроек для админа, но и не нужны |
| Email завершения курса (`notify-course-completion`) | — | смотрит только `courses.notify_on_completion`, игнорирует `student_completed` |
| Email напоминаний о вебинарах (`webinar-reminders-cron`) | — | шлёт всем участникам, **не смотрит** `webinar_reminder.email` |
| Cron `process-reminders` (переобучение) | — | смотрит `course_reminders.notify_student/company/organization`, **не смотрит** `deadline_reminder` |
| `sound` (звук в колокольчике организации) | — | **работает** (`OrgNotifications.tsx` читает `notification_preferences` где `type=sound`) |
| `course_updates`, `homework`, `partner_changes`, `deadline_reminder` (ученик) | **нигде** | **нигде** — переключатели чисто декоративные |
| `group_full`, `homework`, `promo_expired`, `student_waiting`, `student_paid` (организация) | **нигде** | **нигде** — переключатели чисто декоративные |
| Канал `browser` (push) | — | **не реализовано**: нет Service Worker push, нет VAPID, нет `Notification.requestPermission` |
| Канал `telegram` (организация) | — | не связан с настройкой: работает только через `organizations.telegram_notify_enabled` + `chat_id` |

### Вывод

Из ~40 комбинаций «тип × канал», отображённых в двух панелях настроек, **реально что-то делает только 1** — звук в колокольчике организации. Всё остальное сохраняется в `notification_preferences`, но ни одна edge-функция и ни один клиентский код не читает эту таблицу перед отправкой. Push-уведомлений в браузере нет вообще.

---

## План исправления

### Этап 1. Убрать «мёртвые» переключатели (быстрый честный фикс)

Пока нет реализации, UI не должен обещать функции, которых нет.

- В `useStudentProfile.ts` и `OrgProfileTab.tsx` оставить только те типы/каналы, под которыми есть реальная отправка (см. Этап 2). Остальные пометить бейджем «Скоро» и disable, чтобы не сохраняли `false`, вводя в заблуждение.
- Канал `browser` временно скрыть у ученика и организации.
- Канал `telegram` у организации переименовать: указать, что настраивается через раздел «Telegram организации».

### Этап 2. Подключить настройки к реальным отправкам

Общий хелпер `_shared/notifications.ts` (edge) и `checkNotificationPref(userId, type, channel)`:
- читает `notification_preferences` (`enabled`, дефолт по типу),
- возвращает `true`, если канал включён; если строки нет — применяет дефолт из общей карты (совпадает с `buildDefaultNotifSettings`).

Затем подшить проверку в существующие пути:

1. **`notify-course-completion`** (email админам курса) — не меняем, это уровень курса (`notify_on_completion`), а не пользователя. Дополнительно: отправлять и ученику email «поздравляем с завершением», гейт — `student_completed.email` (для ученика тип назвать `course_completed`).
2. **`webinar-reminders-cron`** — перед добавлением email в список получателей проверять `webinar_reminder.email` для каждого `user_id`. Учитывать также `platform`: пишем `org_notifications` только если для владельцев вебинара включён `webinar_reminder.platform` (для ученика будем писать в `student_notifications`, см. п.5).
3. **`process-reminders` (`course_reminders`)** — по каждому получателю (student/company/organization) проверять `deadline_reminder.email` (email) и `deadline_reminder.platform` (in-app).
4. **`org_notifications` insert (везде — `check-subscription-expiry`, `process-document-expiry-reminders`, `notify-enrollment-request`, `notify-course-order`, `AdminDocumentsManager`, `CompanyRequestsTab`, `useCourseStoreManager`, `useStudentDetailCard`, `BackgroundUploadsContext`, `useSubscriptionTab`)** — обёртывать в helper, который смотрит агрегированный флаг организации (например: `student_paid.platform`, `student_completed.platform`, `student_waiting.platform`, `group_full.platform`, `promo_expired.platform`). Если у сотрудников организации выключено — не создавать запись; если включён `email` — параллельно слать письмо.
5. **Домашние задания (`homework`)** — сейчас статус ДЗ живёт в `homework_submissions`, но нигде не пишется уведомление. Добавить в edge-функцию отправки/оценки ДЗ создание записи в `org_notifications` (тип `homework`, гейт `homework.platform` для организации) и в новую таблицу `student_notifications` (для ученика, гейт `homework.platform` / email).

### Этап 3. In-app уведомления для ученика

Сейчас у ученика **нет** таблицы personal-уведомлений (`org_notifications` — только для организации). Панель «Уведомления» в профиле ученика существует, но показывать нечего.

- Создать `public.student_notifications (id, user_id, type, title, message, related_id, is_read, created_at)` с RLS `auth.uid() = user_id`, GRANT authenticated.
- Добавить компонент-колокольчик в шапке ученика (по образцу `OrgNotifications`), realtime-подписка на `INSERT`.
- Писать туда из ключевых событий: завершение курса, оценка/комментарий к ДЗ, приближающийся дедлайн, начисление партнёру, изменение доступа к курсу.

### Этап 4. Браузерные push-уведомления (канал `browser`)

Только после этапов 1–3, если это действительно нужно клиентам:
- добавить VAPID-ключи в secrets,
- в PWA service worker обработчик `push` + `notificationclick`,
- клиентский `Notification.requestPermission` + `subscribe(pushManager)`,
- таблица `push_subscriptions (user_id, endpoint, keys)`,
- edge-функция `send-push`, вызываемая параллельно `email/platform` там, где включён `browser`.

Если по итогу этапа 1 канал `browser` решено не поддерживать — этот этап пропустить.

### Технические детали

- Все `insert` в `org_notifications`, `admin_notifications`, а также email-рассылки из edge-функций проходят через новый `_shared/notifications.ts` (проверка `notification_preferences` + запись в `email_send_log` уже есть).
- Дефолты и «карта» типов вынести в `_shared/notificationTypes.ts` — одна и та же карта у клиента (`useStudentProfile` / `OrgProfileTab`) и на бэкенде, чтобы не расходились.
- Для org-канала (несколько сотрудников) правило: включено, если хотя бы у одного сотрудника соответствующий переключатель включён; email — рассылать только тем, у кого email включён.
- Миграция для `student_notifications` включает `GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_notifications TO authenticated; GRANT ALL ON public.student_notifications TO service_role;` и RLS-политики на `user_id = auth.uid()` + служебная роль.
- Оставить sound-переключатель как есть (единственное работающее).

### Что попросить у тебя перед реализацией

1. Оставляем канал `browser` (push) в roadmap или убираем из UI совсем?
2. Тип `partner_changes` — хочешь email/уведомления при начислении реферальной комиссии?
3. Тип `course_updates` (у ученика) — что именно он должен ловить: изменения структуры курса организацией, открытие следующих модулей, продление доступа? Или это тоже убрать?
