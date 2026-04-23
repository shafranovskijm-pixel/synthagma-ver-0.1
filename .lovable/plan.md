

# Вебинары: усиление прав, исправление завершения и UX-улучшения

После предыдущего раунда фиксов остались **3 критичных бага доступа/устойчивости** и группа UX-улучшений для админа и организации.

---

## Критичные баги в коде

### 1. `WebinarsManager.handleStopLive` НЕ удаляет LiveKit-комнату
В БД у 0 из 7 LiveKit-вебинаров заполнено `webinars.room_name` — `roomName` хранится только в `player_settings.livekit.roomName`. Текущий код:
```ts
.select("recording_status, source_type, room_name")
if (full?.source_type === "livekit" && full?.room_name) { livekit-end-room }
```
→ условие НИКОГДА не выполняется → комната висит на LiveKit Cloud, ест минуты тарифа, участники остаются в эфире.
**Фикс:** читать `player_settings`, проверять `ps?.livekit?.roomName`. Edge-функция уже умеет оба пути — нужно лишь снять блокировку на клиенте.

### 2. `AdminWebinarsOverview.closePlayer` теряет запись и оставляет комнату
При закрытии плеера админ просто делает `update status='ended'` — никакого `livekit-stop-recording` и `livekit-end-room`. Если админ записывал тестовый вебинар → файл потерян, комната активна.
**Фикс:** в `closePlayer` повторить ту же цепочку, что и `WebinarsManager.handleStopLive` (stop-recording → end-room → status=ended). Вынести в общий хелпер `endLiveKitWebinar(webinarId)` и использовать в обоих местах.

### 3. `livekit-issue-token` не выдаёт host-права админу платформы
Сейчас `isHost = isOrgManager || webinar.created_by === user.id`. Глобальный администратор (роль `admin` в `user_roles`) не имеет `organization_id == webinar.organization_id` и не `created_by` чужих вебинаров → подключается как зритель без права публикации/записи. Не может протестировать чужой вебинар.
**Фикс:** добавить проверку `roles.includes('admin')` через `user_roles` (как уже делают остальные edge-функции LiveKit). Также учесть `org_staff`-сотрудников организации как хостов (через `has_org_staff_permission(user, org, 'webinars.write')`) — иначе сотрудник школы не сможет вести эфир.

### 4. `WebinarLive.tsx` всегда передаёт `isHost={isWebinar}` (т.е. `true`)
На странице `/webinar/:id/live` любой авторизованный пользователь видит **`RecordingControls`, модерацию, кнопку «Запись»** — даже если он студент. Edge-функции, конечно, его 403-ят, но кнопки висят и сбивают с толку.
**Фикс:** взять `isHost` из ответа `livekit-issue-token` (поле `data.isHost` уже возвращается!) и пробросить в `RoomShell`.

---

## Улучшения для админа платформы

### 5. В таблице `AdminWebinarsOverview` нет колонки «Запись»
Поля `recording_status`, `recording_url`, `recording_size_bytes` вообще не подтягиваются в `SELECT_FIELDS`. Админ не видит, у каких вебинаров есть запись и сколько весит.
**Фикс:** добавить в SELECT, новая колонка «Запись» с значками: «—» / «Идёт» (красный кружок) / «Готовится» / «✓ MP4 320 МБ» (с иконкой скачивания → открывает `recording_url` в новой вкладке).

### 6. Нет фильтра «по организации» и быстрого перехода в кабинет организации
Админ видит сотни вебинаров, не может отфильтровать по конкретной организации.
**Фикс:** селект «Организация» (top-15 по числу вебинаров + поиск); в строке организации добавить ссылку «→ кабинет» (через существующий `adminViewAsOrg`).

### 7. Нет массовых действий
Удалить разом 20 завершённых тестовых вебинаров нельзя.
**Фикс:** чекбоксы в строках + кнопка «Удалить выбранные» (с подтверждением).

### 8. Кнопка «Запустить вебинар сейчас» берёт ПЕРВУЮ организацию из БД
```ts
.from("organizations").select("id").order("created_at", asc).limit(1)
```
Это неконтролируемо — админ создаст вебинар у случайной школы. На проде — у самой старой организации в системе.
**Фикс:** диалог выбора организации (с поиском); по умолчанию подставлять админскую организацию из `profiles.organization_id`, если есть.

---

## Улучшения для кабинета организации

### 9. В карточке вебинара нет статуса записи
В сетке `WebinarsManager` показано только «Запись доступна», если `recording_url` уже скопирован. Состояния «Идёт запись», «Обрабатывается», «Не удалось» не видно.
**Фикс:** маленький бейдж под заголовком: красный «● REC», янтарный «обработка», зелёный «✓ MP4».

### 10. Нет быстрого превью записи прямо из карточки
Сейчас, чтобы посмотреть запись, нужно «Войти в эфир» → загрузка LiveKit → плеер увидит, что запись есть. Долго.
**Фикс:** при `status==='ended' && recording_url` — кнопка «▶ Смотреть запись» открывает мини-`<Dialog>` с `<video controls src=recording_url>`.

### 11. Чекбокс «Записывать автоматически» не отображается в карточке
Поле `webinars.auto_record` (NOT NULL, default false) есть в БД, `AutoRecordTrigger` его читает, но в `CreateWebinarDialog`/`InlinePlayerSettings` чекбокса нет — пользователь не может его включить.
**Фикс:** в диалоге создания вебинара (LiveKit-источник) — переключатель «Автоматически записывать эфир» под полем «Длительность».

### 12. Кнопка «Стоп» не показывает прогресс остановки
`handleStopLive` делает 3 шага последовательно (stop-recording → end-room → update status). Пока выполняется, кнопка просто disabled. Пользователь не понимает, на каком этапе зависло.
**Фикс:** заменить «Завершить» на step-индикатор в toast: «Останавливаю запись…», «Закрываю комнату…», «Готово».

### 13. После «Завершить» баннер «Сейчас в эфире» исчезает мгновенно, но запись ещё пуллится 1–5 минут
Пользователь думает, что всё готово, и закрывает страницу. Polling в `RecordingControls` останавливается (компонент размонтирован).
**Фикс:** перенести polling в **server-side cron** (новый edge `livekit-finalize-recordings` каждую минуту: проходит вебинары с `recording_status='processing' OR 'stopped'`, дёргает `livekit-copy-recording`). Это гарантия, что запись подхватится даже без открытой вкладки.

---

## Технические детали

| Файл | Изменение |
|---|---|
| `src/components/organization/WebinarsManager.tsx` | `handleStopLive`: SELECT `player_settings`, проверять `ps.livekit.roomName`. Вынести в `src/utils/endLiveKitWebinar.ts`. Прогресс-toast по шагам. |
| `src/components/admin/AdminWebinarsOverview.tsx` | Импорт `endLiveKitWebinar`, использование в `closePlayer`. SELECT добавить `recording_status, recording_url, recording_size_bytes`. Колонка «Запись». Фильтр «Организация». Чекбоксы + bulk delete. Диалог выбора организации для one-click. |
| `src/components/webinars/RecordingStatusBadge.tsx` | Новый компонент: маленький бейдж по `recording_status` (active/processing/uploaded/failed). Используется в обоих кабинетах. |
| `src/components/webinars/RecordingPreviewDialog.tsx` | Новый: `<Dialog>` с `<video src={recordingUrl}>` и кнопкой «Скачать» / «Скопировать ссылку». |
| `src/components/organization/CreateWebinarDialog.tsx` | Switch «Автоматически записывать эфир» (только для `source_type='livekit'`), пишет в `auto_record`. |
| `supabase/functions/livekit-issue-token/index.ts` | Добавить чтение `user_roles` → `isAdmin`. Добавить `has_org_staff_permission(user_id, org_id, 'webinars.write')` через RPC. `isHost = isAdmin \|\| isOrgStaff \|\| created_by==user.id`. |
| `src/pages/WebinarLive.tsx` | Сохранять `isHost` из `data.isHost`; передавать в `RoomShell` вместо `isWebinar`. Скрывать `RecordingControls` для зрителей. |
| `supabase/functions/livekit-finalize-recordings/index.ts` | Новый cron-edge: каждую минуту находит вебинары с `recording_status IN ('processing','stopped','starting')`, для каждого вызывает internal-логику copy-recording. Регистрация в `cron.schedule`. |
| `src/components/admin/AdminCreateWebinarDialog.tsx` | Селект организации (по умолчанию — админская из profile, если есть). |

### Что НЕ меняем
- Гостевой режим `/w/:token` — без изменений.
- Kinescope/external источники — без изменений.
- AI-tutor (`aiTutorSessionId`) ветка `livekit-issue-token` — не трогаем.
- RLS на `webinars` — права админа уже работают через `is_admin()` policy.

### Проверка после фиксов (end-to-end)
1. Админ → «Запустить вебинар сейчас» → выбирает свою организацию → одно нажатие → эфир. После закрытия — комната удалена на LiveKit Cloud, запись (если была) сохранена в Cloud.
2. Организация: создаёт вебинар с галкой «Авто-запись» → начинает эфир → запись стартует сама. После «Завершить» — toast прогресса; даже если закрыть вкладку, cron `livekit-finalize-recordings` через ≤1 мин допуллит файл.
3. Сотрудник школы (роль `org_staff` с правом `webinars.write`) → подключается → получает host-права → может управлять записью.
4. Студент открывает `/webinar/:id/live` → видит плеер БЕЗ кнопок записи и модерации.
5. Админ в таблице видит колонку «Запись», может скачать MP4 одним кликом, фильтровать по организации, массово удалять.

