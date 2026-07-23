## Что клиент видит сейчас

Ученик закончил курс — письмо на почту не пришло. Причины (подтверждены чтением кода):

1. **Ученику письмо не отправляется вообще.** `supabase/functions/notify-course-completion/index.ts` пишет только in-app уведомление ученику и шлёт email **организации** + адресам из `completion_notify_emails`. Отдельной ветки «письмо ученику» нет, даже если у него в профиле `course_completed.email = ON` (а это дефолт).
2. **Функция часто вообще не вызывается.** Триггер БД `enrollments` авто-выставляет `status='completed'` при `progress>=100` (`20260411050701…sql`) — во многих сценариях фронтовый вызов `safeInvoke('notify-course-completion', ...)` из `useCourseLearningFacade.ts` не срабатывает (нет теста в конце, авто-финализация из лестницы прогресса и т.п.). А сам вызов на фронте ещё и залочен под `if (course.notify_on_completion)` (это переключатель «уведомлять организацию»), т.е. если организация не включила рассылку себе — ученику тоже ничего не уйдёт.
3. Переключатель «Email» на типах `homework/deadline_reminder/partner_changes/course_updates` в профиле ученика сохраняется в `notification_preferences`, но по большей части не «дёргается» ни одной edge-функцией (кроме `deadline_reminder` в `process-reminders` и `partner_changes` в `referral-commission`).

## Что делаем

### 1. Гарантированное письмо ученику при завершении курса

`supabase/functions/notify-course-completion/index.ts`:
- Убрать ранний `return`, если `notify_on_completion=false`. Теперь функция всегда исполняется, а `notify_on_completion` управляет только рассылкой организации / доп. адресам.
- Добавить блок «письмо ученику»: если `isPrefEnabled(user_id, 'course_completed', 'email')` → отправить `sendPlatformEmail` на `profile.email` в фирменном шаблоне (поздравление, название курса, дата, ссылка «Мои документы / сертификат»). Skip suppression → нет.
- Дедупликация: writing to `email_send_log` уже происходит внутри `sendPlatformEmail`; дополнительно ставим `idempotencyKey: course-complete-<enrollment_id>-student` в metadata (в шапке письма/subject), чтобы повторный клик не дублировал письмо в одном логе.

### 2. Гарантированный триггер уведомления

Триггер БД `enrollments_auto_complete_on_progress` уже переводит `status='completed'`. Добавляем **второй AFTER-UPDATE триггер** `enrollments_notify_on_complete`: когда `NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed'`, вызывает edge `notify-course-completion` через `net.http_post` c body `{course_id, user_id, enrollment_id}`. Это закрывает все пути (авто-финализация лестницей, ручной тест, API из мобильного и т.п.).

На фронте (`useCourseLearningFacade.ts`) убираем условие `if (course.notify_on_completion)` — теперь вызов делаем всегда (двойная подстраховка + мгновенное письмо без ожидания cron/trigger). Дедуп на бэке отсекает лишний повтор.

### 3. Аудит переключателей `notification_preferences`

Пройти end-to-end и подключить недостающие шлюзы:

| Тип                  | Где триггерится                            | Что чиним |
|----------------------|--------------------------------------------|-----------|
| `course_completed`   | notify-course-completion                   | добавить email ученику (см. п.1) |
| `webinar_reminder`   | webinar-reminders-cron                     | уже гейтится корректно, оставляем |
| `deadline_reminder`  | process-reminders                          | уже гейтится, оставляем |
| `partner_changes`    | referral-commission                        | уже гейтится, оставляем |
| `homework`           | нигде                                      | добавить in-app + email ученику в момент оценки / комментария домашней работы (edge `notify-homework-graded`, дёргаем из UI преподавателя при `homework_submissions.update`). Снимаем ярлык «Coming soon» после подключения. |
| `course_updates`     | нигде                                      | оставить «Coming soon», НО добавить один реально работающий кейс: при `enrollments.insert` (новый доступ к курсу) — in-app + email ученику через новую edge `notify-course-access-granted`, гейт по `course_updates.email/platform`. Можно тем же путём отсылать при смене `default_access_days`. |

### 4. UI

`src/hooks/useStudentProfile.ts` / `StudentProfileNotifications*`:
- Снять флаг `comingSoon` с `homework` и `course_updates` после включения реальных путей.
- Добавить рядом с каждым тумблером маленькую строку «когда приходит», чтобы клиент понимал, что настройка живая.

Организации в `OrgProfileTab` — без изменений (соответствующие пути через `notify_on_completion` уже работают).

### 5. Проверка

- Через `supabase.functions.invoke('notify-course-completion', ...)` из devtools — письмо ученику приходит, лог в `email_send_log`.
- Ручное `UPDATE enrollments SET status='completed' ...` в тест-организации — триггер вызывает функцию, письмо приходит.
- Выключить `course_completed.email` в профиле ученика → повторный прогон не шлёт email ученику, но in-app и письмо организации остаются.
- Прогон `pnpm tsgo` (или встроенный typecheck), просмотр `edge_function_logs` на `notify-course-completion`, `notify-homework-graded`, `notify-course-access-granted`.

## Технические детали

- Новые edge-функции: `notify-homework-graded`, `notify-course-access-granted` (одинаковый скелет: cors, service-role client, `isPrefEnabled` для email, `notifyStudent` для in-app, `sendPlatformEmail` с фирменным HTML).
- Миграция `enrollments_notify_on_complete_trigger.sql`:
  - `CREATE OR REPLACE FUNCTION public.trg_notify_course_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ ... net.http_post(url:=<functions_url>/notify-course-completion, headers:=..., body:=json_build_object(...)) $$;`
  - `CREATE TRIGGER enrollments_notify_on_complete AFTER UPDATE ON public.enrollments FOR EACH ROW WHEN (NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed') EXECUTE FUNCTION public.trg_notify_course_completion();`
  - Через `supabase--insert` (URL/anon key user-specific), не через `migration`.
- `notify-course-completion` — принимает и `enrollment_id` опционально, использует для idempotencyKey.
- Дедлайн запросов не меняем; таблицу `notification_preferences`/`student_notifications` не трогаем.

## Файлы

- `supabase/functions/notify-course-completion/index.ts` — правка (email ученику, без раннего return).
- `supabase/functions/notify-homework-graded/index.ts` — новая.
- `supabase/functions/notify-course-access-granted/index.ts` — новая.
- `src/hooks/course-learning/useCourseLearningFacade.ts` — снять условие `notify_on_completion` перед invoke.
- `src/hooks/useStudentProfile.ts` — снять `comingSoon` с homework/course_updates.
- Вызовы новых функций: из UI преподавателя при оценке ДЗ; из `create_enrollment*`/UI выдачи доступа (org side).
- SQL: `supabase--insert` для триггера `enrollments_notify_on_complete`.
