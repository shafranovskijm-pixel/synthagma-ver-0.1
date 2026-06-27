
## Цель
Подключить IP-телефонию МТС Exolve в `/sales` так, чтобы менеджеры звонили клиентам прямо из браузера, все звонки автоматически записывались и попадали в карточку компании/сделки. Админ может «войти глазами менеджера» и слушать его звонки (по аналогии с `orgViewAsCompany`).

## Архитектура

```text
Браузер менеджера ──WebRTC/SIP──► Exolve SBC ──► Клиент
       │                              │
       │ initiate/hangup              │ webhook (call.status, recording.ready)
       ▼                              ▼
  Edge functions (exolve-*)  ◄── Edge `exolve-webhook`
       │
       ▼
  Таблица call_logs (ссылка на запись в Exolve, без копирования файла)
```

Звонок — браузерный SIP (JsSIP) через WebRTC-шлюз Exolve. Для каждого менеджера в Exolve создаётся SIP-аккаунт (логин/пароль), Sintagma выдаёт его фронту краткоживущим токеном из edge-функции. Запись хранится у Exolve; мы храним только `call_id` и при прослушивании каждый раз запрашиваем у Exolve свежий signed URL через `call-record-api/downloading-record` (наш edge-проксик).

## База данных

Новые таблицы (миграция + GRANT + RLS):
- `exolve_sip_accounts` — `user_id`, `sip_username`, `sip_password_enc` (pgp_sym_encrypt), `caller_id_number`, `is_active`. RLS: владелец читает свою запись; `service_role` — всё; админ — через `has_role`.
- `call_logs` — `id`, `manager_user_id`, `company_inn`, `lead_id?`, `proposal_id?`, `direction` (outbound/inbound), `from_number`, `to_number`, `started_at`, `answered_at`, `ended_at`, `duration_sec`, `status` (answered/no_answer/busy/failed), `exolve_call_id`, `has_recording`, `notes`. RLS: менеджер видит свои; админ — все; организации — нет.
- `call_log_listens` — аудит-лог прослушиваний (`call_log_id`, `listener_user_id`, `listened_at`). Чтоб админ видел, кто и когда слушал.

## Edge functions
1. `exolve-sip-token` — выдаёт фронту JsSIP-конфиг текущего менеджера (расшифровывает пароль из `exolve_sip_accounts` через RPC).
2. `exolve-call-start` — лог факта начала звонка (создаёт `call_logs` со статусом `dialing`, возвращает `call_log_id`).
3. `exolve-webhook` (`verify_jwt = false`, подпись через `X-Exolve-Signature` + секрет) — принимает события `call.status`, `call.recording.ready`, обновляет `call_logs.exolve_call_id`, `status`, `has_recording`.
4. `exolve-recording-url` — по `call_log_id` дёргает `call-record-api/downloading-record`, возвращает временный URL, пишет запись в `call_log_listens`. Доступно: менеджер-владелец, админ, режим «admin view as sales manager».
5. `exolve-admin-provision-sip` — админ создаёт/привязывает SIP-аккаунт менеджеру.

Все функции читают `EXOLVE_API_TOKEN`, `EXOLVE_APP_ID`, `EXOLVE_WEBHOOK_SECRET`, `EXOLVE_SIP_DOMAIN` из секретов (запрошу через `add_secret` на этапе реализации).

## Фронт

Новые компоненты (в `src/components/admin/sales/`):
- `SoftphoneWidget.tsx` — плавающая панелька в `/sales` (низ-право). Поля: номер, кнопки call/hangup/mute, индикатор статуса. Внутри — `useExolveSoftphone` (JsSIP) + UI на shadcn.
- `CallHistoryTab.tsx` — таблица всех звонков менеджера: дата, компания, направление, длительность, статус, кнопка «Прослушать» (открывает inline `<audio>` со ссылкой от `exolve-recording-url`), заметка.
- `CompanyCallsCard.tsx` — врезка в `Deals360` карточку компании: последние 10 звонков по этому ИНН + кнопка «Позвонить» (префиллит софтфон).
- `useExolveSoftphone.ts` — хук: подключение к WSS Exolve, исходящий вызов, события (`progress`/`accepted`/`ended`/`failed`), создаёт `call_logs` через `exolve-call-start`, слушает Realtime по своему `call_logs` ряду чтобы подтянуть `exolve_call_id` и `has_recording` без перезагрузки.

Изменения в `SalesManager.tsx`:
- В `salesMenuGroups` добавить пункт **«Звонки»** → `CallHistoryTab`.
- Внутри `SalesManager` рендерить `<SoftphoneWidget />` (только если у менеджера есть `exolve_sip_accounts`).

Изменения в `Deals360`/`CompanyCard`:
- Кнопка «Позвонить» рядом с телефоном — диспатчит `window` event `sintagma:softphone-call` с номером; `SoftphoneWidget` ловит и инициирует.

## Админка: «войти глазами менеджера»

По паттерну `orgViewAsCompany` (`src/utils/adminViewMode.ts`):
- Утилита `adminViewAsSalesManager`: пишет в localStorage `adminViewAsSalesManager = { userId, fullName }`.
- В `AdminDashboard` добавляем вкладку **«Менеджеры по продажам»** со списком (из `sales_managers` + `user_roles`). Кнопка «Войти как» → ставит флаг и редиректит на `/sales`.
- `SalesDashboard.tsx`: если флаг есть и текущий userRole=admin — рендерим `SalesManager` в режиме observer:
  - все RPC/SELECT звонков по `call_logs` идут с фильтром по `viewed_user_id`,
  - `SoftphoneWidget` отключён (нельзя звонить от лица менеджера),
  - бейдж сверху «Просмотр от лица: Иванов И.И. · Выйти».
- RLS на `call_logs`: разрешаем SELECT администраторам (`has_role(auth.uid(),'admin')`). Фронт сам подставляет нужный фильтр.

## Технические детали (для разработчика)

- Деп: `bun add jssip`.
- WebRTC требует https — у нас и так https на проде, на localhost браузер допускает.
- Хранение SIP-пароля: `pgp_sym_encrypt`/`pgp_sym_decrypt` через SECURITY DEFINER RPC `get_exolve_sip_credentials(_user_id uuid)` (как уже сделано для `organization_credentials`).
- Webhook подпись Exolve: HMAC-SHA256 от тела запроса, сравнение в edge — иначе 401.
- Realtime: подписка фронта на `call_logs` по `manager_user_id = auth.uid()` чтобы статусы обновлялись без F5.
- При удалении менеджера — `call_logs` остаются (история), `exolve_sip_accounts` каскадом удаляются.
- Память проекта: добавим запись `mem://integrations/exolve-ip-telephony` с ключевыми правилами (только ссылка на запись, не качаем файл; «view as sales manager» через `adminViewAsSalesManager`).

## Что НЕ делаем
- Не качаем mp3 в наш Storage (по вашему выбору) — только ссылка/проксированный signed URL.
- Не делаем входящие звонки в этой итерации (Exolve умеет, но пока вне scope).
- Не делаем транскрибацию (Call Transcribation API), оставляем на потом.

## Что потребуется от вас перед началом
1. Включить услугу Voice/SIP в личном кабинете Exolve и получить:
   - `EXOLVE_API_TOKEN` (Bearer),
   - `EXOLVE_APP_ID`,
   - `EXOLVE_SIP_DOMAIN` (вида `sip.exolve.ru`) и WSS-URL,
   - один купленный городской/мобильный номер для `caller_id`.
2. Сгенерировать `EXOLVE_WEBHOOK_SECRET` (могу сделать через `generate_secret`) и прописать его в личном кабинете Exolve на endpoint `…/functions/v1/exolve-webhook`.
3. Список менеджеров, которым сразу заводим SIP-аккаунты (или сделаем UI и заведёте сами).
